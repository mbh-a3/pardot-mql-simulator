import React, { useState, useMemo } from "react";
import {
  Calculator,
  Settings,
  UserCheck,
  TrendingUp,
  AlertCircle,
  RefreshCcw,
  Copy,
  CheckCircle2,
  Users,
  BarChart3,
  BrainCircuit
} from "lucide-react";

/**
 * Pardot Grade Logic:
 * Pardot generally starts at 'D'. Matches increase the grade by 1/3, 2/3, or 3/3 of a letter.
 * Sequence: F, D-, D, D+, C-, C, C+, B-, B, B+, A-, A, A+
 */
const GRADE_LADDER = ["F", "D-", "D", "D+", "C-", "C", "C+", "B-", "B", "B+", "A-", "A", "A+"];
const BASE_GRADE_INDEX = 2; // Starts at 'D'

const SCORING_CRITERIA_DEFAULTS = {
  "Custom Redirect Click": 3,
  "Email Open": 0,
  "Event Checked In": 10,
  "Event Registered": 5,
  "File Access": 3,
  "Form Error": -5,
  "Form Handler Error": -5,
  "Form Handler Submission": 50,
  "Form Submission": 50,
  "Landing Page Error": -5,
  "Landing Page Success": 50,
  "Olark Chat": 10,
  "Opportunity Created": 0,
  "Opportunity Lost": -100,
  "Opportunity Won": 0,
  "Page View": 1,
  "Site Search Query": 3,
  "Social Message Link Click": 3,
  "Third Party Click": 3,
  "Tracker Link Click": 3,
  "Visitor Session": 0,
  "Webinar Attended": 10,
  "Webinar Invited": 0,
  "Webinar Registered": 5
};

const GRADING_CRITERIA_OPTIONS = ["Country", "Department", "Employees", "Title Segment", "Annual Revenue", "Industry"];

const MATCH_LEVELS = [
  { label: "Strong Match (3/3)", value: 3, description: "Full letter grade increase" },
  { label: "Good Match (2/3)", value: 2, description: "2/3 letter grade increase" },
  { label: "Weak Match (1/3)", value: 1, description: "1/3 letter grade increase" },
  { label: "No Match", value: 0, description: "No impact" }
];

export default function App() {
  const [activeTab, setActiveTab] = useState("simulator");
  const [scoringModel, setScoringModel] = useState(SCORING_CRITERIA_DEFAULTS);
  const [mqlThreshold, setMqlThreshold] = useState(100);
  const [gradeThreshold, setGradeThreshold] = useState("B-");

  // Grading Rules: Maps a Category (e.g. Country) to a user input value (e.g. "USA") and a weight
  const [gradingRules, setGradingRules] = useState([
    { id: 1, category: "Country", value: "USA", weight: 3 },
    { id: 2, category: "Industry", value: "Technology", weight: 2 },
    { id: 3, category: "Title Segment", value: "Director", weight: 3 }
  ]);

  // Simulator State
  const [simActivities, setSimActivities] = useState({});
  const [simProfile, setSimProfile] = useState({
    Country: "USA",
    Department: "",
    Employees: "",
    "Title Segment": "Manager",
    "Annual Revenue": "",
    Industry: "Technology"
  });

  // --- Logic Helpers ---
  const calculateScore = useMemo(() => {
    let total = 0;
    Object.entries(simActivities).forEach(([key, count]) => {
      if (scoringModel[key]) {
        total += scoringModel[key] * (count || 0);
      }
    });
    return total;
  }, [simActivities, scoringModel]);

  const calculateGrade = useMemo(() => {
    let steps = BASE_GRADE_INDEX; // Start at D

    gradingRules.forEach((rule) => {
      const userValue = simProfile[rule.category];
      if (userValue && userValue.toLowerCase() === rule.value.toLowerCase()) {
        steps += rule.weight;
      }
    });

    if (steps > 12) steps = 12;
    if (steps < 0) steps = 0;
    return GRADE_LADDER[steps];
  }, [simProfile, gradingRules]);

  const isMQL = useMemo(() => {
    const gradeIndex = GRADE_LADDER.indexOf(calculateGrade);
    const thresholdIndex = GRADE_LADDER.indexOf(gradeThreshold);
    return calculateScore >= mqlThreshold && gradeIndex >= thresholdIndex;
  }, [calculateScore, calculateGrade, mqlThreshold, gradeThreshold]);

  // --- Handlers ---
  const handleScoreChange = (key, val) => {
    setScoringModel((prev) => ({ ...prev, [key]: parseInt(val, 10) || 0 }));
  };

  const handleSimActivityChange = (key, val) => {
    setSimActivities((prev) => ({ ...prev, [key]: parseInt(val, 10) || 0 }));
  };

  const addGradingRule = () => {
    const newId = Math.max(...gradingRules.map((r) => r.id), 0) + 1;
    setGradingRules([...gradingRules, { id: newId, category: "Country", value: "", weight: 1 }]);
  };

  const updateGradingRule = (id, field, value) => {
    setGradingRules((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const removeGradingRule = (id) => {
    setGradingRules((prev) => prev.filter((r) => r.id !== id));
  };

  const generateGeminiPrompt = () => {
    const rulesText = gradingRules.map((r) => `- ${r.category} matching "${r.value}" gets ${r.weight}/3 increase`).join("\n");
    const scoresText = Object.entries(scoringModel)
      .filter(([_, v]) => v !== 0)
      .map(([k, v]) => `- ${k}: ${v} pts`)
      .join("\n");

    return `I am designing a Pardot MQL model. Please review my configuration and suggest improvements.

**My Goals:**
- Target MQL Score: ${mqlThreshold}
- Target MQL Grade: ${gradeThreshold}

**My Scoring Weights:**
${scoresText}

**My Grading Rules:**
${rulesText}

**Question:**
Based on these settings, am I over-indexing on passive behaviors? Are there any obvious gaps or risks of false positives with this configuration? Please recommend an ideal MQL criteria balance.`;
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for older browsers / permission edge cases
      const el = document.createElement("textarea");
      el.value = text;
      el.setAttribute("readonly", "");
      el.style.position = "absolute";
      el.style.left = "-9999px";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
  };

  // --- Components ---
  const TabButton = ({ id, label, icon: Icon }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
        activeTab === id
          ? "border-blue-600 text-blue-600 bg-blue-50"
          : "border-transparent text-slate-600 hover:text-slate-800 hover:bg-slate-50"
      }`}
    >
      <Icon size={18} />
      {label}
    </button>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 shadow-sm">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white shadow-md">
              <Calculator size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800">Pardot MQL Architect</h1>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Extended Edition</p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-4 text-sm text-slate-500 bg-slate-100 px-4 py-2 rounded-full">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
              Live Calculator
            </span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Navigation Tabs */}
        <div className="flex overflow-x-auto border-b border-slate-200 bg-white rounded-t-xl shadow-sm mb-6">
          <TabButton id="simulator" label="Simulator & Playground" icon={UserCheck} />
          <TabButton id="scoring" label="Scoring Weights" icon={TrendingUp} />
          <TabButton id="grading" label="Grading Matrix" icon={BarChart3} />
          <TabButton id="gemini" label="Gemini Consultant" icon={BrainCircuit} />
        </div>

        {/* Tab Content */}
        <div className="space-y-6">
          {/* --- SCORING TAB --- */}
          {activeTab === "scoring" && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                  <TrendingUp size={20} className="text-blue-600" />
                  Scoring Criteria Configuration
                </h2>
                <p className="text-slate-500 text-sm mt-1">
                  Assign point values to user actions. Negative values are allowed for detrimental actions.
                </p>
              </div>

              <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4">
                {Object.keys(scoringModel)
                  .sort()
                  .map((key) => (
                    <div
                      key={key}
                      className="flex items-center justify-between group p-2 rounded-lg hover:bg-slate-50 transition-colors"
                    >
                      <label className="text-sm font-medium text-slate-700 truncate pr-4" title={key}>
                        {key}
                      </label>
                      <input
                        type="number"
                        value={scoringModel[key]}
                        onChange={(e) => handleScoreChange(key, e.target.value)}
                        className="w-20 px-3 py-1.5 text-right border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      />
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* --- GRADING TAB --- */}
          {activeTab === "grading" && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                <div>
                  <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                    <BarChart3 size={20} className="text-blue-600" />
                    Grading Matrix
                  </h2>
                  <p className="text-slate-500 text-sm mt-1">
                    Define demographic rules. When a prospect matches these criteria, their grade increases.
                  </p>
                </div>
                <button
                  onClick={addGradingRule}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg shadow-sm transition-colors flex items-center gap-2"
                >
                  <Users size={16} /> Add Rule
                </button>
              </div>

              <div className="p-6 space-y-3">
                {gradingRules.length === 0 && (
                  <div className="text-center py-10 text-slate-400 italic">No grading rules defined yet.</div>
                )}

                {gradingRules.map((rule) => (
                  <div
                    key={rule.id}
                    className="flex flex-col md:flex-row gap-3 items-start md:items-center bg-slate-50 p-3 rounded-lg border border-slate-200"
                  >
                    <div className="flex-1 w-full md:w-auto">
                      <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Criteria</label>
                      <select
                        value={rule.category}
                        onChange={(e) => updateGradingRule(rule.id, "category", e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {GRADING_CRITERIA_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex-1 w-full md:w-auto">
                      <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">
                        Value (Exact Match)
                      </label>
                      <input
                        type="text"
                        value={rule.value}
                        onChange={(e) => updateGradingRule(rule.id, "value", e.target.value)}
                        placeholder="e.g. USA, CEO, Tech"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div className="flex-1 w-full md:w-auto">
                      <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Impact</label>
                      <select
                        value={rule.weight}
                        onChange={(e) => updateGradingRule(rule.id, "weight", parseInt(e.target.value, 10))}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {MATCH_LEVELS.map((m) => (
                          <option key={m.value} value={m.value}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="mt-auto md:mb-[3px]">
                      <button
                        onClick={() => removeGradingRule(rule.id)}
                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                        title="Remove Rule"
                      >
                        <AlertCircle size={18} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* --- SIMULATOR TAB --- */}
          {activeTab === "simulator" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Col */}
              <div className="lg:col-span-2 space-y-6">
                {/* MQL Definition Settings */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                  <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                    <Settings size={18} className="text-slate-500" />
                    Global MQL Thresholds
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Minimum Score</label>
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min="0"
                          max="300"
                          step="10"
                          value={mqlThreshold}
                          onChange={(e) => setMqlThreshold(parseInt(e.target.value, 10))}
                          className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                        />
                        <span className="w-12 text-center font-bold text-blue-600 bg-blue-50 py-1 rounded">
                          {mqlThreshold}
                        </span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Minimum Grade</label>
                      <select
                        value={gradeThreshold}
                        onChange={(e) => setGradeThreshold(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {GRADE_LADDER.map((g) => (
                          <option key={g} value={g}>
                            {g}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Profile Builder */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                  <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                    <Users size={18} className="text-slate-500" />
                    Test Prospect Profile (Grading)
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {GRADING_CRITERIA_OPTIONS.map((criteria) => (
                      <div key={criteria}>
                        <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">{criteria}</label>
                        <input
                          type="text"
                          value={simProfile[criteria] || ""}
                          onChange={(e) => setSimProfile({ ...simProfile, [criteria]: e.target.value })}
                          placeholder={`Enter ${criteria}`}
                          className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-100 text-sm text-blue-800 flex items-start gap-2">
                    <AlertCircle size={16} className="mt-0.5 shrink-0" />
                    <p>
                      Tip: Enter values that match your <strong>Grading Matrix</strong> to see the grade increase.
                    </p>
                  </div>
                </div>

                {/* Activity Builder */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                  <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                    <TrendingUp size={18} className="text-slate-500" />
                    Test Prospect Activities (Scoring)
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
                    {Object.keys(scoringModel)
                      .sort()
                      .map((key) => (
                        <div
                          key={key}
                          className={`p-3 rounded-lg border ${
                            simActivities[key] ? "bg-blue-50 border-blue-200" : "bg-slate-50 border-slate-100"
                          } transition-all`}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <label className="text-xs font-medium text-slate-700 leading-tight block w-24">{key}</label>
                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                scoringModel[key] < 0 ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
                              }`}
                            >
                              {scoringModel[key] > 0 ? "+" : ""}
                              {scoringModel[key]}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min="0"
                              value={simActivities[key] || 0}
                              onChange={(e) => handleSimActivityChange(key, e.target.value)}
                              className="w-full px-2 py-1 text-sm border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 outline-none"
                              placeholder="Qty"
                            />
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>

              {/* Right Col */}
              <div className="lg:col-span-1">
                <div className="sticky top-8 space-y-4">
                  <div
                    className={`rounded-xl shadow-lg border-2 p-6 text-center transition-all ${
                      isMQL ? "bg-green-50 border-green-500 shadow-green-100" : "bg-white border-slate-200"
                    }`}
                  >
                    <h2 className="text-slate-500 font-semibold uppercase tracking-widest text-xs mb-4">Prospect Status</h2>

                    <div className="flex justify-center items-center gap-2 mb-2">
                      {isMQL ? (
                        <div className="flex items-center gap-2 text-green-600 font-bold text-3xl">
                          <CheckCircle2 size={32} /> MQL QUALIFIED
                        </div>
                      ) : (
                        <div className="text-slate-400 font-bold text-3xl">UNQUALIFIED</div>
                      )}
                    </div>

                    <p className="text-sm text-slate-500 mb-6">
                      {isMQL ? "This prospect meets both Score and Grade thresholds." : "Thresholds not met."}
                    </p>

                    <div className="grid grid-cols-2 gap-4 border-t border-slate-200/60 pt-6">
                      <div className="text-center">
                        <div className="text-sm text-slate-500 mb-1">Total Score</div>
                        <div className={`text-4xl font-bold ${calculateScore >= mqlThreshold ? "text-blue-600" : "text-slate-700"}`}>
                          {calculateScore}
                        </div>
                        <div className="text-xs text-slate-400 mt-1">Target: {mqlThreshold}</div>
                      </div>
                      <div className="text-center border-l border-slate-200/60">
                        <div className="text-sm text-slate-500 mb-1">Calculated Grade</div>
                        <div
                          className={`text-4xl font-bold ${
                            GRADE_LADDER.indexOf(calculateGrade) >= GRADE_LADDER.indexOf(gradeThreshold)
                              ? "text-blue-600"
                              : "text-slate-700"
                          }`}
                        >
                          {calculateGrade}
                        </div>
                        <div className="text-xs text-slate-400 mt-1">Target: {gradeThreshold}</div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                    <button
                      onClick={() => {
                        setSimActivities({});
                        setSimProfile({
                          Country: "",
                          Department: "",
                          Employees: "",
                          "Title Segment": "",
                          "Annual Revenue": "",
                          Industry: ""
                        });
                      }}
                      className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-sm font-medium transition-colors"
                    >
                      <RefreshCcw size={16} /> Reset Simulation
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* --- GEMINI CONSULTANT TAB --- */}
          {activeTab === "gemini" && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-8 text-center max-w-2xl mx-auto">
                <div className="w-16 h-16 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <BrainCircuit size={32} />
                </div>
                <h2 className="text-2xl font-bold text-slate-800 mb-2">Refine with Gemini</h2>
                <p className="text-slate-600 mb-8">
                  We've bundled your Scoring Weights, Grading Rules, and Thresholds into a structured prompt. Copy the text below and
                  paste it into a Gemini chat to get an expert critique of your MQL model.
                </p>

                <div className="bg-slate-900 rounded-lg p-4 text-left shadow-inner relative group">
                  <pre className="text-slate-300 text-sm font-mono whitespace-pre-wrap h-64 overflow-y-auto custom-scrollbar">
                    {generateGeminiPrompt()}
                  </pre>
                  <button
                    onClick={() => copyToClipboard(generateGeminiPrompt())}
                    className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded text-xs font-medium backdrop-blur-sm transition-colors flex items-center gap-2"
                  >
                    <Copy size={14} /> Copy Prompt
                  </button>
                </div>

                <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
                  <div className="p-4 bg-purple-50 rounded-lg border border-purple-100">
                    <h4 className="font-semibold text-purple-900 text-sm mb-1">Gap Analysis</h4>
                    <p className="text-xs text-purple-700">
                      Gemini will check if you are missing key scoring opportunities compared to industry standards.
                    </p>
                  </div>
                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
                    <h4 className="font-semibold text-blue-900 text-sm mb-1">Threshold Sanity</h4>
                    <p className="text-xs text-blue-700">
                      Get advice on whether your 100-point threshold is too aggressive for your point values.
                    </p>
                  </div>
                  <div className="p-4 bg-green-50 rounded-lg border border-green-100">
                    <h4 className="font-semibold text-green-900 text-sm mb-1">Grading Balance</h4>
                    <p className="text-xs text-green-700">
                      Ensure your demographic weights don't accidentally exclude viable prospects.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
