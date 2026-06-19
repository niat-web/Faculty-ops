// Static catalogs: training-track skill checklists and exit-checklist items.
// These are product knowledge, not per-instructor data.

export const TRACK_SKILLS = {
  "Frontend Development": [
    "Static Web", "Responsive Design", "Modern Responsive UI",
    "JavaScript Sprint", "JavaScript Essentials", "React JS", "Frontend Projects",
  ],
  "Backend Development": [
    "Python Essentials", "Databases & SQL", "REST APIs",
    "Authentication", "Node / Express", "Backend Projects",
  ],
  "DSA": [
    "Time Complexity", "Arrays & Strings", "Linked Lists",
    "Trees & Graphs", "Dynamic Programming", "Problem-Solving Sprint",
  ],
  "Gen AI": [
    "Python for AI", "Prompt Engineering", "LLM Fundamentals",
    "RAG & Embeddings", "Building AI Apps", "Gen AI Capstone",
  ],
  "DSML": [
    "Statistics", "Python for Data", "Data Wrangling",
    "ML Algorithms", "Model Evaluation", "DSML Capstone",
  ],
};

export const ALL_TRACKS = Object.keys(TRACK_SKILLS);

// Stable machine key for a (track, skill) pair → used as the Map key on instructors.
export function skillKey(track, skill) {
  return `${track}::${skill}`.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

// Exit / offboarding checklist line items (PRD §8).
export const EXIT_ITEMS = [
  { key: "learning_portal_removal", label: "Learning Portal Removal" },
  { key: "teams_whatsapp_removal", label: "Teams / WhatsApp Removal" },
  { key: "id_card_submission", label: "ID Card Submission" },
  { key: "darwin_removal", label: "Darwin Removal" },
  { key: "teach_os_removal", label: "Teach OS Removal" },
  { key: "hr_ops_update", label: "HR Ops Update" },
];

export const EXIT_TYPES = ["Resignation", "Termination", "End of Contract", "Absconding", "Other"];
