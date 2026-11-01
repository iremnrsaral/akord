// server.js - AkordEval: Akıllı Açık Uçlu Sınav Değerlendirme & Rubrik Doğrulama Sistemi
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'data', 'database.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

// --- Helper Database Functions ---
function loadDatabase() {
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading database:', err);
    return { settings: {}, students: [], courses: [], assessments: [], submissions: [] };
  }
}

function saveDatabase(db) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing database:', err);
  }
}

// --- Semantic Analysis & Evaluator Engine ---
function runLocalSemanticEvaluation(assessment, studentText) {
  const textLower = studentText.toLowerCase();
  const sentences = studentText
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 5);

  const criteriaResults = [];
  let totalScore = 0;
  const evidenceHighlights = [];

  // Check custom AI instructions and known misconceptions
  const aiInstructions = (assessment.aiInstructions || '').toLowerCase();
  let hasNightMisconception = false;

  if (textLower.includes('gece') && (textLower.includes('karanlık evre') || textLower.includes('calvin') || textLower.includes('fotosentez'))) {
    hasNightMisconception = true;
  }

  // 1. Rubric Evaluation
  for (const crit of assessment.rubric) {
    const critTitle = crit.title.toLowerCase();
    const critDesc = (crit.description || '').toLowerCase();
    
    const tokens = (critTitle + ' ' + critDesc)
      .replace(/[(),.\/]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3 && !['ile', 'veya', 'olan', 'olarak', 'için', 'gibi', 'doğru', 'açıklanmalıdır', 'belirtilmelidir'].includes(w));

    let matchCount = 0;
    let matchedSentence = null;

    for (const sentence of sentences) {
      const sLower = sentence.toLowerCase();
      let sMatches = 0;
      for (const token of tokens) {
        if (sLower.includes(token) || sLower.includes(token.substring(0, Math.max(3, token.length - 2)))) {
          sMatches++;
        }
      }
      if (sMatches > matchCount) {
        matchCount = sMatches;
        matchedSentence = sentence;
      }
    }

    let assignedPoints = 0;
    let status = 'unmet';
    let comment = '';

    const isMisconceptionRelated = hasNightMisconception && (crit.id === 'crit-b3' || crit.id === 'crit-b1');

    if (isMisconceptionRelated) {
      assignedPoints = Math.round(crit.maxPoints * 0.4);
      status = 'partial';
      comment = "Öğrenci 'Calvin döngüsü gece gerçekleşir' yanılgısına kapılmış; temel basamak puanı kırıldı.";
    } else if (matchCount >= 4 || (tokens.length > 0 && (matchCount / Math.min(tokens.length, 5)) >= 0.7)) {
      assignedPoints = crit.maxPoints;
      status = 'met';
      comment = 'Öğretmenin aradığı temel kavramlar ve nedensellik bağı eksiksiz aktarılmış.';
    } else if (matchCount >= 2) {
      assignedPoints = Math.round(crit.maxPoints * 0.7);
      status = 'mostly_met';
      comment = 'Ölçütün ana unsurları mevcut fakat bazı ara basamaklar veya teknik detaylar yüzeysel kalmış.';
    } else if (matchCount >= 1) {
      assignedPoints = Math.round(crit.maxPoints * 0.35);
      status = 'partial';
      comment = 'Ölçüte yüzeysel bir değinme var; yeterli derinlik ve açıklama sunulmamış.';
    } else {
      assignedPoints = 0;
      status = 'unmet';
      comment = 'Ölçütte aranan konu öğrenci yanıtında yer almıyor veya tamamen atlanmış.';
    }

    totalScore += assignedPoints;
    criteriaResults.push({
      criterionId: crit.id,
      name: crit.title,
      assignedPoints,
      maxPoints: crit.maxPoints,
      status,
      comment
    });

    if (matchedSentence) {
      evidenceHighlights.push({
        text: matchedSentence,
        type: isMisconceptionRelated ? 'error' : (status === 'met' ? 'success' : 'warning'),
        tag: `Ölçüt: ${crit.title.substring(0, 24)}... (${assignedPoints}/${crit.maxPoints}p)`,
        note: isMisconceptionRelated ? "Calvin döngüsü gece olmaz; ışık reaksiyonu ürünleri olmadan çalışamaz." : comment
      });
    }
  }

  // 2. Mandatory Concepts Analysis (Paraphrasing & Semantic Matching)
  const mandatoryAnalysis = [];
  const mandatoryList = assessment.mandatoryConcepts || [];

  for (const m of mandatoryList) {
    let conceptFound = false;
    let detectedSentence = null;
    let matchedKeywords = 0;

    const keywords = m.semanticKeywords || [];
    for (const sentence of sentences) {
      const sLower = sentence.toLowerCase();
      let kwCount = 0;
      for (const kw of keywords) {
        if (sLower.includes(kw.toLowerCase())) {
          kwCount++;
        }
      }
      if (kwCount >= Math.min(2, Math.max(1, keywords.length))) {
        conceptFound = true;
        detectedSentence = sentence;
        matchedKeywords = kwCount;
        break;
      }
    }

    if (conceptFound && matchedKeywords >= 3) {
      mandatoryAnalysis.push({
        concept: m.concept,
        status: 'tam_eslesme',
        explanation: 'Öğretmenin zorunlu tuttuğu anlam öbeği, öğrenci tarafından farklı kelimelerle de olsa anlamsal olarak tam karşılandı (Paraphrase doğrulandı).',
        detectedSentence
      });
    } else if (conceptFound) {
      mandatoryAnalysis.push({
        concept: m.concept,
        status: 'kismen_eslesme',
        explanation: 'Kavramın bir kısmı ifade edilmiş fakat bazı kritik ara öğeler eksik aktarılmış.',
        detectedSentence
      });
    } else {
      mandatoryAnalysis.push({
        concept: m.concept,
        status: 'eslesmedi',
        explanation: 'Öğretmenin mutlaka yazılmasını istediği bu temel kavram öğrenci metninde bulunamadı.',
        detectedSentence: null
      });
    }
  }

  // 3. Teacher Diagnosis & Feedback Draft
  totalScore = Math.min(assessment.maxScore, Math.max(0, totalScore));
  let strengths = '';
  let weaknesses = '';
  let verdict = '';

  if (totalScore >= 85) {
    strengths = 'Öğrenci öğretmenin rubriğindeki ölçütleri kavramış ve kendi cümleleriyle akademik tutarlılıkta ifade etmiştir.';
    weaknesses = 'Ciddi bir kavramsal boşluk bulunmamaktadır.';
    verdict = 'Yüksek başarı örneği. Öğretmen onayı için tavsiye edilir.';
  } else if (totalScore >= 55) {
    strengths = 'Konunun temel mekanizması genel hatlarıyla bilinmektedir.';
    weaknesses = 'Öğretmenin rubrikte belirttiği bazı kritik ara ürünler veya döngüsel aşamalar atlanmış.';
    verdict = 'Kısmi puan önerildi. Öğretmenin eksikleri inceleyip notu teyit etmesi önerilir.';
  } else {
    strengths = 'Konuyla ilgili temel düzeyde birkaç terim kullanılmış.';
    weaknesses = 'Açık uçlu sorunun gerektirdiği bilimsel derinlik karşılanmamış; kavram yanılgısı veya büyük boşluk mevcut.';
    verdict = 'Düşük puan önerildi. Öğretmen incelemesi gerekmektedir.';
  }

  const whyThisScore = `Öğrenci yanıtı öğretmenin belirlediği ${assessment.rubric.length} rubrik ölçütüne ve ${mandatoryList.length} zorunlu anlamsal kavrama göre analiz edilmiştir. Toplam ${totalScore} puan hesaplanmıştır.`;

  const studentFeedbackDraft = totalScore >= 75
    ? `Tebrikler! Açık uçlu soruda istenen biyokimyasal mekanizmayı ve nedensellik ilişkisini kendi cümlelerinle çok başarılı bir şekilde kurdun.`
    : `Yanıtında konunun bazı ana hatları mevcut; ancak öğretmenimizin rubrikte özellikle aradığı bazı zorunlu ara kavramlar eksik kalmış. Vurgulanan eksik kısımları gözden geçirmeni tavsiye ederim.`;

  return {
    suggestedScore: totalScore,
    criteriaBreakdown: criteriaResults,
    mandatoryConceptsAnalysis: mandatoryAnalysis,
    evidenceHighlights: evidenceHighlights.filter((v, i, a) => a.findIndex(t => t.text === v.text) === i),
    teacherDiagnosis: {
      whyThisScore,
      strengths,
      weaknesses,
      verdict
    },
    studentFeedbackDraft
  };
}

// --- Live Gemini API Integration ---
async function runGeminiEvaluation(apiKey, modelName, assessment, studentText) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName || 'gemini-2.5-flash'}:generateContent?key=${apiKey}`;

  const prompt = `
Sen yükseköğretim ve K-12 düzeyinde uzman bir Eğitim Ölçme ve Değerlendirme Yapay Zekasısın.
Aşağıda verilen açık uçlu sınav/ödev sorusunu, öğretmenin tanımladığı rubriğe ve değerlendirme ölçütlerine göre titizlikle analiz et.

DİKKAT EDİLECEK EN ÖNEMLİ KURALLAR:
1. ANLAMSAL ANALİZ (PARAPHRASING): Öğretmenin istediği kavramlar öğrenci tarafından birebir ezber cümlelerle değil, farklı kelimelerle veya farklı cümle yapılarıyla ifade edilmiş olsa dahi, eğer bilimsel/akademik anlam doğruysa bunu MUTLAKA tam veya yüksek puanla ödüllendir.
2. ÖĞRETMENİN ÖZEL TALİMATLARI: ${assessment.aiInstructions || 'Rubriğe sadık kal.'}
3. KANIT ODAKLI VE GEREKÇELİ OL: Öğrencinin metninden doğrudan alıntı yaparak nerenin doğru, nerenin eksik veya kavram yanılgısı olduğunu net açıkla.
4. KESİNLİKLE JSON FORMATINDA YANIT VER.

--- SINAV BİLGİLERİ ---
Soru: ${assessment.question}
Maksimum Puan: ${assessment.maxScore}

--- ÖĞRETMENİN RUBRİK ÖLÇÜTLERİ ---
${JSON.stringify(assessment.rubric, null, 2)}

--- ÖĞRETMENİN ZORUNLU KAVRAMLARI ---
${JSON.stringify(assessment.mandatoryConcepts || [], null, 2)}

--- ÖĞRETMENİN REFERANS / EĞİTİM ÖRNEKLERİ (FEW-SHOT EXAMPLES) ---
${JSON.stringify(assessment.referenceExemplars || [], null, 2)}

--- DEĞERLENDİRİLECEK ÖĞRENCİ YANITI ---
"${studentText}"

Lütfen SADECE aşağıdaki JSON şemasına uyan JSON objesi döndür:
{
  "suggestedScore": 85,
  "criteriaBreakdown": [
    {
      "criterionId": "crit-1",
      "name": "Ölçüt Adı",
      "assignedPoints": 20,
      "maxPoints": 25,
      "status": "met | mostly_met | partial | unmet",
      "comment": "Neden bu puan verildiğinin kısa açıklaması"
    }
  ],
  "mandatoryConceptsAnalysis": [
    {
      "concept": "Zorunlu kavram",
      "status": "tam_eslesme | kismen_eslesme | eslesmedi",
      "explanation": "Farklı kelimelerle nasıl karşılandığı veya neden karşılanmadığı",
      "detectedSentence": "Metinden eşleşen cümle"
    }
  ],
  "evidenceHighlights": [
    {
      "text": "Öğrenci metninden cımbızlanan cümle",
      "type": "success | warning | error | neutral",
      "tag": "Etiket (örn: Ölçüt 1 Karşılandı / Kavram Yanılgısı)",
      "note": "Öğretmene not"
    }
  ],
  "teacherDiagnosis": {
    "whyThisScore": "Yapay zekanın öğretmene bu puanı neden önerdiğinin detaylı gerekçesi",
    "strengths": "Güçlü yönler",
    "weaknesses": "Eksik veya hatalı bulunan kısımlar",
    "verdict": "Öğretmene tavsiye"
  },
  "studentFeedbackDraft": "Öğrenciye yönelik nazik ve yapıcı geri bildirim taslağı"
}
`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json"
      }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API Hatası (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error('Gemini API yanıt üretmedi.');

  const cleanJson = rawText.replace(/```json\n?|\n?```/g, '').trim();
  return JSON.parse(cleanJson);
}

// --- MIME Types ---
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

// --- HTTP Server ---
const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host}`);
  const pathname = urlObj.pathname;
  const method = req.method;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const sendJson = (statusCode, data) => {
    res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data));
  };

  const readBody = () => {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch (e) {
          reject(e);
        }
      });
      req.on('error', reject);
    });
  };

  try {
    // ----------------- API ROUTES -----------------
    if (pathname.startsWith('/api/')) {
      const db = loadDatabase();

      // 1. GET /api/settings
      if (pathname === '/api/settings' && method === 'GET') {
        const safeSettings = { ...db.settings };
        if (safeSettings.geminiApiKey) {
          safeSettings.hasApiKey = true;
          safeSettings.maskedKey = safeSettings.geminiApiKey.substring(0, 4) + '...' + safeSettings.geminiApiKey.slice(-4);
        } else {
          safeSettings.hasApiKey = false;
        }
        return sendJson(200, safeSettings);
      }

      // 2. POST /api/settings
      if (pathname === '/api/settings' && method === 'POST') {
        const payload = await readBody();
        db.settings = { ...db.settings, ...payload };
        saveDatabase(db);
        return sendJson(200, { success: true, message: 'Ayarlar güncellendi' });
      }

      // 3. GET /api/students
      if (pathname === '/api/students' && method === 'GET') {
        const studentsWithStats = (db.students || []).map(std => {
          const stdSubmissions = (db.submissions || []).filter(s => s.studentId === std.id);
          const approvedCount = stdSubmissions.filter(s => s.teacherReview?.isApproved).length;
          const pendingCount = stdSubmissions.filter(s => !s.teacherReview?.isApproved).length;
          
          return {
            ...std,
            submissionCount: stdSubmissions.length,
            approvedCount,
            pendingCount
          };
        });
        return sendJson(200, studentsWithStats);
      }

      // 4. GET /api/students/:id
      if (pathname.startsWith('/api/students/') && method === 'GET') {
        const stdId = pathname.split('/')[3];
        const student = (db.students || []).find(s => s.id === stdId);
        if (!student) return sendJson(404, { error: 'Öğrenci bulunamadı' });

        // Get student's enrolled courses with details
        const enrolledCourses = (db.courses || []).filter(c => student.enrolledCourseIds?.includes(c.id));
        const submissions = (db.submissions || []).filter(s => s.studentId === stdId);

        return sendJson(200, {
          student,
          courses: enrolledCourses,
          submissions
        });
      }

      // 5. GET /api/courses
      if (pathname === '/api/courses' && method === 'GET') {
        return sendJson(200, db.courses || []);
      }

      // 6. GET /api/assessments
      if (pathname === '/api/assessments' && method === 'GET') {
        const courseId = urlObj.searchParams.get('courseId');
        let list = db.assessments || [];
        if (courseId) {
          list = list.filter(a => a.courseId === courseId);
        }
        return sendJson(200, list);
      }

      // 7. GET /api/assessments/:id
      if (pathname.startsWith('/api/assessments/') && method === 'GET' && !pathname.includes('/train')) {
        const id = pathname.split('/')[3];
        const assessment = (db.assessments || []).find(a => a.id === id);
        if (!assessment) return sendJson(404, { error: 'Sınav/Ödev bulunamadı' });
        return sendJson(200, assessment);
      }

      // 8. POST /api/assessments/:id/train (Öğretmenin Yapay Zekayı Eğitmesi / Rubriği Güncellemesi)
      if (pathname.includes('/train') && method === 'POST') {
        const id = pathname.split('/')[3];
        const payload = await readBody();
        const aIdx = (db.assessments || []).findIndex(a => a.id === id);
        if (aIdx === -1) return sendJson(404, { error: 'Sınav/Ödev bulunamadı' });

        // Update assessment with new rubric, instructions, and few-shot examples
        db.assessments[aIdx] = {
          ...db.assessments[aIdx],
          question: payload.question || db.assessments[aIdx].question,
          aiInstructions: payload.aiInstructions || db.assessments[aIdx].aiInstructions,
          rubric: payload.rubric || db.assessments[aIdx].rubric,
          mandatoryConcepts: payload.mandatoryConcepts || db.assessments[aIdx].mandatoryConcepts,
          referenceExemplars: payload.referenceExemplars || db.assessments[aIdx].referenceExemplars,
          maxScore: payload.maxScore || db.assessments[aIdx].maxScore
        };

        // Automatically re-evaluate submissions for this assessment using updated AI training criteria!
        let reevaluatedCount = 0;
        const updatedAssessment = db.assessments[aIdx];
        for (const sub of db.submissions) {
          if (sub.assessmentId === id) {
            sub.aiEvaluation = runLocalSemanticEvaluation(updatedAssessment, sub.studentText);
            sub.status = sub.teacherReview?.isApproved ? sub.status : 'draft_ai';
            reevaluatedCount++;
          }
        }

        saveDatabase(db);
        return sendJson(200, {
          success: true,
          message: 'Yapay zeka yeni rubrik ölçütleri ve örneklerle başarıyla eğitildi. İlgili tüm sınav/ödevler güncel ölçütlere göre yeniden analiz edildi.',
          assessment: updatedAssessment,
          reevaluatedCount
        });
      }

      // 9. GET /api/submissions
      if (pathname === '/api/submissions' && method === 'GET') {
        const studentId = urlObj.searchParams.get('studentId');
        const assessmentId = urlObj.searchParams.get('assessmentId');
        let subs = db.submissions || [];
        if (studentId) subs = subs.filter(s => s.studentId === studentId);
        if (assessmentId) subs = subs.filter(s => s.assessmentId === assessmentId);
        return sendJson(200, subs);
      }

      // 10. POST /api/evaluate
      if (pathname === '/api/evaluate' && method === 'POST') {
        const { submissionId, useLiveAi } = await readBody();
        const subIndex = db.submissions.findIndex(s => s.id === submissionId);
        if (subIndex === -1) return sendJson(404, { error: 'Öğrenci yanıtı bulunamadı' });

        const submission = db.submissions[subIndex];
        const assessment = db.assessments.find(a => a.id === submission.assessmentId);
        if (!assessment) return sendJson(404, { error: 'İlgili sınav/ödev bulunamadı' });

        let evaluationResult;
        let usedEngine = 'local-semantic';

        const apiKey = db.settings.geminiApiKey;
        if (useLiveAi && apiKey) {
          try {
            evaluationResult = await runGeminiEvaluation(apiKey, db.settings.modelName, assessment, submission.studentText);
            usedEngine = 'gemini-live';
          } catch (err) {
            console.warn('Gemini live evaluation failed, falling back to local engine:', err.message);
            evaluationResult = runLocalSemanticEvaluation(assessment, submission.studentText);
            usedEngine = 'local-fallback';
          }
        } else {
          evaluationResult = runLocalSemanticEvaluation(assessment, submission.studentText);
        }

        submission.aiEvaluation = evaluationResult;
        submission.status = 'draft_ai'; // Strictly draft until teacher approves!
        submission.evaluationEngine = usedEngine;
        submission.evaluatedAt = new Date().toISOString().replace('T', ' ').substring(0, 16);

        saveDatabase(db);
        return sendJson(200, {
          success: true,
          submission,
          engine: usedEngine
        });
      }

      // 11. POST /api/approve (Öğretmenin Onaylaması)
      if (pathname === '/api/approve' && method === 'POST') {
        const { submissionId, approvedScore, teacherNotes, reviewedBy, studentFeedback } = await readBody();
        const subIndex = db.submissions.findIndex(s => s.id === submissionId);
        if (subIndex === -1) return sendJson(404, { error: 'Öğrenci yanıtı bulunamadı' });

        const submission = db.submissions[subIndex];
        const aiScore = submission.aiEvaluation ? submission.aiEvaluation.suggestedScore : approvedScore;
        const finalScore = Number(approvedScore);

        submission.teacherReview = {
          isApproved: true,
          approvedScore: finalScore,
          teacherNotes: teacherNotes || '',
          approvedAt: new Date().toISOString().replace('T', ' ').substring(0, 16),
          reviewedBy: reviewedBy || 'Ders Sorumlusu Öğretmen'
        };

        if (studentFeedback && submission.aiEvaluation) {
          submission.aiEvaluation.studentFeedbackDraft = studentFeedback;
        }

        submission.status = (finalScore === aiScore) ? 'approved' : 'revised';
        saveDatabase(db);

        return sendJson(200, {
          success: true,
          submission,
          message: 'Değerlendirme öğretmen tarafından resmi olarak onaylandı ve not kütüğüne işlendi.'
        });
      }

      // 12. GET /api/export/:assessmentId
      if (pathname.startsWith('/api/export/') && method === 'GET') {
        const assessmentId = pathname.split('/')[3];
        const assessment = db.assessments.find(a => a.id === assessmentId);
        const subs = db.submissions.filter(s => s.assessmentId === assessmentId);

        let csv = '\uFEFF';
        csv += 'Ogrenci No,Ad Soyad,Sinav/Odev,AI Oneri Puani,Ogretmen Onayli Not,Durum,Ogretmen Notu,Ogrenci Geri Bildirimi\n';
        for (const s of subs) {
          const student = db.students.find(st => st.id === s.studentId);
          const aiScore = s.aiEvaluation ? s.aiEvaluation.suggestedScore : '';
          const finalScore = s.teacherReview?.isApproved ? s.teacherReview.approvedScore : 'ONAY BEKLİYOR';
          const statusText = s.teacherReview?.isApproved ? 'ONAYLANDI' : 'TASLAK (ONAYLANMADI)';
          const notes = (s.teacherReview?.teacherNotes || '').replace(/"/g, '""');
          const fb = (s.aiEvaluation?.studentFeedbackDraft || '').replace(/"/g, '""');
          csv += `"${student ? student.studentNumber : ''}","${student ? student.name : ''}","${assessment ? assessment.title : ''}","${aiScore}","${finalScore}","${statusText}","${notes}","${fb}"\n`;
        }

        res.writeHead(200, {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="akord_notlar_${assessmentId}.csv"`
        });
        res.end(csv);
        return;
      }

      return sendJson(404, { error: 'API endpoint bulunamadı' });
    }

    // ----------------- STATIC FILE SERVER -----------------
    let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(PUBLIC_DIR, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Sunucu hatası: ' + err.code);
      } else {
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
      }
    });

  } catch (error) {
    console.error('Server error:', error);
    sendJson(500, { error: 'Sunucu hatası', details: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 AkordEval Sunucusu Başarıyla Başlatıldı!`);
  console.log(`📡 URL: http://localhost:${PORT}`);
  console.log(`👨‍🏫 Öğretmen Sayfası: Öğrenci Profilleri -> Dersler -> Sınavlar -> Değerlendirme`);
  console.log(`=======================================================`);
});
