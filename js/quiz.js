document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("quiz-container");
  const feedback = document.getElementById("quiz-feedback");
  const lang = localStorage.getItem("language") || "de";

  let quizData = [];
  let current = 0;
  let correct = 0;
  let resultTemplate = "";

  // Sprachdatei laden und Quiz starten
  fetch(`lang/${lang}.json?cb=${Date.now()}`)
    .then((r) => r.json())
    .then((t) => {
      quizData = t.quiz?.questions || [];
      resultTemplate =
        t.quiz?.result || "Du hast {{score}} von {{total}} richtig!";
      if (quizData.length === 0) {
        container.textContent = "Keine Fragen verfügbar.";
        return;
      }
      renderQuestion();
    });

  function renderQuestion() {
    feedback.style.display = "none";

    if (current >= quizData.length) {
      showFeedback();
      return;
    }

    const q = quizData[current];

    container.innerHTML = `
      <div class="quiz-question">${q.text}</div>
      <div class="quiz-answers">
        ${q.answers
          .map(
            (a, i) => `<button class="quiz-answer" data-i="${i}">${a}</button>`
          )
          .join("")}
      </div>
    `;

    container.querySelectorAll(".quiz-answer").forEach((btn) =>
      btn.addEventListener("click", () => {
        const selected = +btn.dataset.i;
        if (selected === q.correct) correct++;
        current++;
        renderQuestion();
      })
    );
  }

  function showFeedback() {
    const stars =
      correct >= quizData.length * 0.8
        ? 3
        : correct >= quizData.length * 0.5
        ? 2
        : 1;

    // Feedback-Text aus Sprachdatei mit Platzhalter ersetzen
    const resultText = resultTemplate
      .replace("{{score}}", correct)
      .replace("{{total}}", quizData.length);

    container.innerHTML = ""; // Quiz ausblenden

    feedback.innerHTML = `
      <div>${resultText}</div>
      <div class="quiz-stars" style="margin-top: 0.5em;">
        ${"★".repeat(stars)}${"☆".repeat(3 - stars)}
      </div>
    `;
    feedback.style.display = "block";
  }
});
