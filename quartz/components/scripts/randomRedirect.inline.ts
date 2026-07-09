function checkRedirect() {
  const path = decodeURIComponent(window.location.pathname).toLowerCase();
  if (path.includes("random-case") || path.includes("random case")) {
    const cases = [
      "Case---Animal-Injury", "Case---Cash-Payment", "Case---Letter-of-Intent-and-cic",
      "Case---Revocation-of-Offer", "Case---Silence-as-Acceptance", "Case---Acceptance-with-Modifications",
      "Case---Deadline-for-Acceptance", "Case---Newspaper-Ad", "Case---Delayed-Acceptance",
      "Case---Revocation-vs-Acceptance", "Case---Minor-Capacity", "Case---Agency-without-Authority",
      "Case---Standard-Terms", "Case---Avoidance-for-Deceit", "Case---Delayed-Delivery",
      "Case---Loan-Usury", "Case---Right-of-Second-Chance", "Case---Plumber-and-Vase",
      "Case---Vicarious-Liability", "Case---Slip-and-Fall", "Case---Impossibility",
      "Case---Default-of-Delivery", "Case---Defective-Battery", "Case---Consumer-Warranty",
      "Case---Sick-Horse", "Case---Refusal-of-Cure", "Case---Skateboard-Software",
      "Case---Sidewalk-Collision", "Case---Vandalism", "Case---Drone-Privacy",
      "Case---Supervision-of-Minors", "Case---Mental-Capacity", "Case---Good-Faith-and-Stolen-Boat",
      "Case---Good-Faith-and-Skateboard", "Case---Lease-and-Right-of-Possession"
    ];
    const randomCase = cases[Math.floor(Math.random() * cases.length)];
    const parts = window.location.pathname.split("/");
    if (parts[parts.length - 1] === "") {
      parts.pop();
    }
    parts.pop();
    const base = parts.join("/");
    const hasHtml = window.location.pathname.toLowerCase().includes(".html");
    window.location.replace(base + "/" + randomCase + (hasHtml ? ".html" : ""));
  }
}
document.addEventListener("nav", checkRedirect);
checkRedirect();
