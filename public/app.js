// public/app.js - AkordEval Vue 3 Client Application
const { createApp, ref, computed, onMounted } = Vue;

createApp({
  setup() {
    // --- Navigation & View Hierarchy ---
    // 'students' -> 'student_detail' -> 'course_detail' -> 'evaluation'
    const currentView = ref('students');
    const selectedStudentId = ref('std-irem'); // Default to İrem Nur Saral
    const selectedCourseId = ref('course-bio');
    const selectedAssessmentId = ref('asn-bio-vize');

    // Data lists
    const students = ref([]);
    const courses = ref([]);
    const assessments = ref([]);
    const submissions = ref([]);
    const studentSearchQuery = ref('');
    const isLoading = ref(false);
    const isEvaluating = ref(false);
    const isTrainingAi = ref(false);
    const useLiveGemini = ref(false);

    // Settings
    const settings = ref({
      geminiApiKey: '',
      hasApiKey: false,
      maskedKey: '',
      modelName: 'gemini-2.5-flash'
    });
    const showSettingsModal = ref(false);
    const showTrainAiModal = ref(false);
    const newApiKeyInput = ref('');

    // Teacher Review Form
    const teacherReviewForm = ref({
      approvedScore: 0,
      teacherNotes: '',
      reviewerName: 'Ders Sorumlusu Öğretmen',
      studentFeedback: '',
      criteriaScores: {}
    });

    // AI Training Form State (Rubric & Exemplars)
    const trainAiForm = ref({
      assessmentId: '',
      title: '',
      question: '',
      maxScore: 100,
      aiInstructions: '',
      rubric: [],
      mandatoryConcepts: [],
      referenceExemplars: []
    });

    // --- Computed Entities ---
    const activeStudent = computed(() => {
      return students.value.find(s => s.id === selectedStudentId.value) || null;
    });

    const activeCourse = computed(() => {
      return courses.value.find(c => c.id === selectedCourseId.value) || null;
    });

    const activeAssessment = computed(() => {
      return assessments.value.find(a => a.id === selectedAssessmentId.value) || null;
    });

    // Active Student's Enrolled Courses
    const studentEnrolledCourses = computed(() => {
      if (!activeStudent.value) return [];
      return courses.value.filter(c => activeStudent.value.enrolledCourseIds?.includes(c.id));
    });

    // Assessments belonging to the selected course
    const courseAssessments = computed(() => {
      if (!selectedCourseId.value) return [];
      return assessments.value.filter(a => a.courseId === selectedCourseId.value);
    });

    // Active submission being viewed
    const activeSubmission = computed(() => {
      return submissions.value.find(s => 
        s.studentId === selectedStudentId.value && 
        s.assessmentId === selectedAssessmentId.value
      ) || null;
    });

    // Filtered students for search
    const filteredStudents = computed(() => {
      const q = studentSearchQuery.value.trim().toLowerCase();
      if (!q) return students.value;
      return students.value.filter(s => 
        s.name.toLowerCase().includes(q) || 
        s.studentNumber.includes(q) ||
        s.department.toLowerCase().includes(q)
      );
    });

    // Global Statistics
    const globalStats = computed(() => {
      const allSubs = submissions.value;
      const approvedCount = allSubs.filter(s => s.teacherReview?.isApproved).length;
      const draftCount = allSubs.filter(s => !s.teacherReview?.isApproved && s.status === 'draft_ai').length;
      return {
        totalStudents: students.value.length,
        totalCourses: courses.value.length,
        approvedCount,
        draftCount
      };
    });

    // --- Navigation Methods ---
    function goToStudents() {
      currentView.value = 'students';
    }

    function selectStudent(studentId) {
      selectedStudentId.value = studentId;
      const std = students.value.find(s => s.id === studentId);
      if (std && std.enrolledCourseIds && std.enrolledCourseIds.length > 0) {
        selectedCourseId.value = std.enrolledCourseIds[0];
      }
      currentView.value = 'student_detail';
    }

    function selectCourse(courseId) {
      selectedCourseId.value = courseId;
      currentView.value = 'course_detail';
    }

    function viewAssessmentResult(assessmentId) {
      selectedAssessmentId.value = assessmentId;
      currentView.value = 'evaluation';
      initTeacherForm();
    }

    // Initialize Teacher Form with current submission values
    function initTeacherForm() {
      const sub = activeSubmission.value;
      if (!sub) return;

      const aiScore = sub.aiEvaluation ? sub.aiEvaluation.suggestedScore : 0;
      const approvedScore = sub.teacherReview?.isApproved ? sub.teacherReview.approvedScore : aiScore;
      
      const cScores = {};
      if (sub.aiEvaluation?.criteriaBreakdown) {
        sub.aiEvaluation.criteriaBreakdown.forEach(c => {
          cScores[c.criterionId] = c.assignedPoints;
        });
      }

      teacherReviewForm.value = {
        approvedScore: approvedScore,
        teacherNotes: sub.teacherReview?.teacherNotes || '',
        reviewerName: sub.teacherReview?.reviewedBy || (activeCourse.value ? activeCourse.value.instructor : 'Ders Sorumlusu Öğretmen'),
        studentFeedback: sub.aiEvaluation?.studentFeedbackDraft || '',
        criteriaScores: cScores
      };
    }

    function recalculateTotalFromCriteria() {
      let sum = 0;
      for (const key in teacherReviewForm.value.criteriaScores) {
        sum += Number(teacherReviewForm.value.criteriaScores[key]) || 0;
      }
      teacherReviewForm.value.approvedScore = sum;
    }

    // --- API Data Fetching ---
    async function fetchData() {
      try {
        isLoading.value = true;
        const [stdRes, crsRes, asnRes, subRes, setRes] = await Promise.all([
          fetch('/api/students'),
          fetch('/api/courses'),
          fetch('/api/assessments'),
          fetch('/api/submissions'),
          fetch('/api/settings')
        ]);

        students.value = await stdRes.json();
        courses.value = await crsRes.json();
        assessments.value = await asnRes.json();
        submissions.value = await subRes.json();
        settings.value = await setRes.json();

        // Default to first assessment if not set
        if (!selectedAssessmentId.value && assessments.value.length > 0) {
          selectedAssessmentId.value = assessments.value[0].id;
        }

        initTeacherForm();
      } catch (err) {
        console.error('Fetch error:', err);
      } finally {
        isLoading.value = false;
      }
    }

    // --- Single AI Evaluation ---
    async function reevaluateCurrentSubmission() {
      const sub = activeSubmission.value;
      if (!sub) return;

      try {
        isEvaluating.value = true;
        const res = await fetch('/api/evaluate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            submissionId: sub.id,
            useLiveAi: useLiveGemini.value && settings.value.hasApiKey
          })
        });

        const data = await res.json();
        if (data.success) {
          const idx = submissions.value.findIndex(s => s.id === sub.id);
          if (idx !== -1) {
            submissions.value[idx] = data.submission;
          }
          initTeacherForm();

          Swal.fire({
            icon: 'success',
            title: 'Yapay Zeka Analizi Güncellendi',
            text: `Önerilen Puan: ${data.submission.aiEvaluation.suggestedScore} | Motor: ${data.engine === 'gemini-live' ? 'Google Gemini Canlı API' : 'Akord Anlamsal Analiz Motoru'}`,
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 3000
          });
        }
      } catch (err) {
        Swal.fire({ icon: 'error', title: 'Hata', text: err.message });
      } finally {
        isEvaluating.value = false;
      }
    }

    // --- Teacher Approval ---
    async function approveCurrentSubmission() {
      const sub = activeSubmission.value;
      if (!sub) return;

      const payload = {
        submissionId: sub.id,
        approvedScore: teacherReviewForm.value.approvedScore,
        teacherNotes: teacherReviewForm.value.teacherNotes,
        reviewedBy: teacherReviewForm.value.reviewerName,
        studentFeedback: teacherReviewForm.value.studentFeedback
      };

      try {
        const res = await fetch('/api/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (data.success) {
          const idx = submissions.value.findIndex(s => s.id === sub.id);
          if (idx !== -1) {
            submissions.value[idx] = data.submission;
          }

          Swal.fire({
            icon: 'success',
            title: 'Değerlendirme Onaylandı! ✅',
            html: `<b>${activeStudent.value?.name}</b> için <b>${payload.approvedScore} Puan</b> resmi not kütüğüne başarıyla işlendi.`,
            confirmButtonColor: '#2563eb'
          });
        }
      } catch (err) {
        Swal.fire({ icon: 'error', title: 'Hata', text: err.message });
      }
    }

    // --- Open AI Training Modal for Specific Assessment ---
    function openTrainAiModal(assessmentId) {
      const targetId = assessmentId || selectedAssessmentId.value;
      const targetAsn = assessments.value.find(a => a.id === targetId);
      if (!targetAsn) return;

      trainAiForm.value = {
        assessmentId: targetAsn.id,
        title: targetAsn.title,
        question: targetAsn.question,
        maxScore: targetAsn.maxScore || 100,
        aiInstructions: targetAsn.aiInstructions || '',
        rubric: JSON.parse(JSON.stringify(targetAsn.rubric || [])),
        mandatoryConcepts: JSON.parse(JSON.stringify(targetAsn.mandatoryConcepts || [])),
        referenceExemplars: JSON.parse(JSON.stringify(targetAsn.referenceExemplars || []))
      };

      showTrainAiModal.value = true;
    }

    // Add/Remove Rubric Criterion in Training
    function addCriterion() {
      trainAiForm.value.rubric.push({
        id: 'crit-' + Date.now(),
        title: '',
        maxPoints: 20,
        description: ''
      });
    }

    function removeCriterion(idx) {
      trainAiForm.value.rubric.splice(idx, 1);
    }

    // Add/Remove Mandatory Concept
    function addMandatoryConcept() {
      trainAiForm.value.mandatoryConcepts.push({
        id: 'm-' + Date.now(),
        concept: '',
        importance: 'Kritik',
        semanticKeywords: []
      });
    }

    function removeMandatoryConcept(idx) {
      trainAiForm.value.mandatoryConcepts.splice(idx, 1);
    }

    // Add Reference Exemplar
    function addReferenceExemplar() {
      trainAiForm.value.referenceExemplars.push({
        id: 'ref-' + Date.now(),
        type: 'Örnek Yanıt',
        score: 100,
        studentText: '',
        teacherComment: ''
      });
    }

    function removeReferenceExemplar(idx) {
      trainAiForm.value.referenceExemplars.splice(idx, 1);
    }

    // Submit Training to Backend & Re-evaluate
    async function submitTrainAi() {
      try {
        isTrainingAi.value = true;
        const res = await fetch(`/api/assessments/${trainAiForm.value.assessmentId}/train`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(trainAiForm.value)
        });

        const data = await res.json();
        if (data.success) {
          showTrainAiModal.value = false;
          await fetchData();

          Swal.fire({
            icon: 'success',
            title: 'Yapay Zeka Yeni Ölçütlerle Eğitildi! 🧠',
            html: `Yapay zeka öğretmenin güncel ölçütlerini ve referans örneklerini öğrendi.<br><b>${data.reevaluatedCount} öğrencinin sınavı</b> bu yeni ölçütlerle otomatik yeniden analiz edildi.`
          });
        }
      } catch (err) {
        Swal.fire({ icon: 'error', title: 'Hata', text: err.message });
      } finally {
        isTrainingAi.value = false;
      }
    }

    // Save Settings
    async function saveSettings() {
      const payload = { modelName: settings.value.modelName };
      if (newApiKeyInput.value.trim()) {
        payload.geminiApiKey = newApiKeyInput.value.trim();
      }

      try {
        const res = await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          showSettingsModal.value = false;
          newApiKeyInput.value = '';
          await fetchData();
          Swal.fire({
            icon: 'success',
            title: 'Ayarlar Kaydedildi',
            toast: true,
            position: 'top-end',
            timer: 2500,
            showConfirmButton: false
          });
        }
      } catch (err) {
        Swal.fire({ icon: 'error', title: 'Hata', text: err.message });
      }
    }

    // Export CSV
    function exportGrades(assessmentId) {
      const id = assessmentId || selectedAssessmentId.value;
      window.open(`/api/export/${id}`, '_blank');
    }

    // Helper: Render Highlighted Evidence Text
    function renderEvidenceText(text, highlights) {
      if (!highlights || highlights.length === 0) return text;

      let rendered = text;
      const sorted = [...highlights].sort((a, b) => b.text.length - a.text.length);

      for (const h of sorted) {
        const escaped = h.text.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(`(${escaped})`, 'gi');
        
        const cssClass = h.type === 'success' 
          ? 'evidence-success' 
          : (h.type === 'error' ? 'evidence-error' : 'evidence-warning');

        const replacement = `<span class="evidence-pill ${cssClass}" title="${h.tag}: ${h.note}">$1</span>`;
        rendered = rendered.replace(regex, replacement);
      }

      return rendered;
    }

    // Helper: Get student submission status for an assessment
    function getSubmissionForAssessment(assessmentId) {
      return submissions.value.find(s => 
        s.studentId === selectedStudentId.value && 
        s.assessmentId === assessmentId
      );
    }

    onMounted(() => {
      fetchData();
    });

    return {
      currentView,
      selectedStudentId,
      selectedCourseId,
      selectedAssessmentId,
      students,
      courses,
      assessments,
      submissions,
      studentSearchQuery,
      isLoading,
      isEvaluating,
      isTrainingAi,
      useLiveGemini,
      settings,
      showSettingsModal,
      showTrainAiModal,
      newApiKeyInput,
      teacherReviewForm,
      trainAiForm,
      activeStudent,
      activeCourse,
      activeAssessment,
      studentEnrolledCourses,
      courseAssessments,
      activeSubmission,
      filteredStudents,
      globalStats,
      // actions
      fetchData,
      goToStudents,
      selectStudent,
      selectCourse,
      viewAssessmentResult,
      reevaluateCurrentSubmission,
      approveCurrentSubmission,
      openTrainAiModal,
      addCriterion,
      removeCriterion,
      addMandatoryConcept,
      removeMandatoryConcept,
      addReferenceExemplar,
      removeReferenceExemplar,
      submitTrainAi,
      saveSettings,
      exportGrades,
      recalculateTotalFromCriteria,
      renderEvidenceText,
      getSubmissionForAssessment
    };
  }
}).mount('#app');
