import React, { useMemo, useRef, useState } from "react";
import {
  Calculator,
  Settings,
  TrendingUp,
  AlertCircle,
  RefreshCcw,
  CheckCircle2,
  Users,
  BarChart3,
  Upload,
  Download,
  ArrowLeft,
  ArrowRight
} from "lucide-react";

/**
 * Pardot Grade Logic:
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
  { label: "Strong Match (3/3)", value: 3 },
  { label: "Good Match (2/3)", value: 2 },
  { label: "Weak Match (1/3)", value: 1 },
  { label: "No Match", value: 0 }
];

const STEPS = [
  { id: "scoring", title: "Scoring Weights", icon: TrendingUp },
  { id: "grading", title: "Grading Matrix", icon: BarChart3 },
  { id: "simulator", title: "Simulator", icon: Users }
];

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function roundToStep(n, step) {
  return Math.round(n / step) * step;
}

/**
 * Minimal CSV parser:
 * - supports commas and quoted fields with "" escaping
 * - ignores empty lines
 * - returns array of rows (arrays of strings)
 */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (c === '"' && next === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      continue;
    }

    if (c === ",") {
      row.push(field.trim());
      field = "";
      continue;
    }

    if (c === "\n") {
      row.push(field.trim());
      field = "";
      const allEmpty = row.every((x) => (x ?? "").trim() === "");
      if (!allEmpty) rows.push(row);
      row = [];
      continue;
    }

    if (c === "\r") continue;

    field += c;
  }

  // final field
  row.push(field.trim());
  const allEmpty = row.every((x) => (x ?? "").trim() === "");
  if (!allEmpty) rows.push(row);

  return rows;
}

function normalizeHeader(h) {
  return (h || "").trim().toLowerCase();
}

export default function App() {
  // ----- Stage / Stepper -----
  const [stepIndex, setStepIndex] = useState(0);
  const activeStep = STEPS[stepIndex]?.id ?? "scoring";

  // ----- Model State -----
  const [scoringModel, setScoringModel] = useState(SCORING_CRITERIA_DEFAULTS);

  const [gradingRules, setGradingRules] = useState([
    { id: 1, category: "Country", value: "USA", weight: 3 },
    { id: 2, category: "Industry", value: "Technology", weight: 2 },
    { id: 3, category: "Title Segment", value: "Director", weight: 3 }
  ]);

  // Thresholds
  const [mqlThreshold, setMqlThreshold] = useState(100);
  const [gradeThreshold, setGradeThreshold] = useState("B-");

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

  // ----- Import / Export -----
  const importInputRef = useRef(null);

  const csvEscape = (v) => {
  const s = String(v ?? "");
  // Quote if it contains comma, quote, or newline
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

const exportConfig = () => {
  const lines = [];
  lines.push(["type", "key", "value", "weight"].join(","));

  // thresholds
  lines.push(["threshold", "mqlThreshold", mqlThreshold, ""].map(csvEscape).join(","));
  lines.push(["threshold", "gradeThreshold", gradeThreshold, ""].map(csvEscape).join(","));

  // scoring
  Object.keys(scoringModel)
    .sort()
    .forEach((activity) => {
      lines.push(["scoring", activity, scoringModel[activity], ""].map(csvEscape).join(","));
    });

  // grading
  gradingRules.forEach((r) => {
    lines.push(["grading", r.category, r.value, r.weight].map(csvEscape).join(","));
  });

  const csv = lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "mql-architect-config.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

  const triggerImport = () => importInputRef.current?.click();

  const handleImportFile = async (file) => {
    if (!file) return;

    try {
      const text = await file.text();
      const rows = parseCsv(text);

      if (rows.length < 2) return;

      // Build header map
      const header = rows[0].map(normalizeHeader);
      const idx = (name) => header.indexOf(normalizeHeader(name));

      const typeIdx = idx("type");
      const keyIdx = idx("key");
      const valueIdx = idx("value");
      const weightIdx = idx("weight");

      // Require at least: type, key, value
      if (typeIdx === -1 || keyIdx === -1 || valueIdx === -1) return;

      // Collect updates
      const scoringUpdates = {};
      const newGrading = [];
      let importedMqlThreshold = null;
      let importedGradeThreshold = null;

      for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        const type = (row[typeIdx] || "").trim().toLowerCase();
        const key = (row[keyIdx] || "").trim();
        const value = (row[valueIdx] || "").trim();
        const weightRaw = weightIdx >= 0 ? (row[weightIdx] || "").trim() : "";

        if (!type || !key) continue;

        if (type === "scoring") {
          // Merge: allow new keys too
          const n = parseInt(value, 10);
          scoringUpdates[key] = Number.isFinite(n) ? n : 0;
          continue;
        }

        if (type === "grading") {
          const w = parseInt(weightRaw, 10);
          newGrading.push({
            category: GRADING_CRITERIA_OPTIONS.includes(key) ? key : "Country",
            value: value,
            weight: [0, 1, 2, 3].includes(w) ? w : 0
          });
          continue;
        }

        if (type === "threshold") {
          if (key === "mqlthreshold") {
            const n = parseInt(value, 10);
            if (Number.isFinite(n)) importedMqlThreshold = n;
          }
          if (key === "gradethreshold") {
            if (GRADE_LADDER.includes(value)) importedGradeThreshold = value;
          }
        }
      }

      // Apply scoring merges
      if (Object.keys(scoringUpdates).length > 0) {
        setScoringModel((prev) => ({ ...prev, ...scoringUpdates }));
      }

      // Apply grading replace (if any grading rows exist)
      if (newGrading.length > 0) {
        setGradingRules(
          newGrading.map((r, i) => ({
            id: i + 1,
            category: r.category,
            value: r.value,
            weight: r.weight
          }))
        );
      }

      // Apply thresholds
      if (importedMqlThreshold !== null) {
        const v = clamp(roundToStep(importedMqlThreshold, 5), 0, 300);
        setMqlThreshold(v);
      }
      if (importedGradeThreshold) setGradeThreshold(importedGradeThreshold);
    } catch {
      // Fail silently for now
    } finally {
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

  // ----- Logic Helpers -----
  const calculateScore = useMemo(() => {
    let total = 0;
    Object.entries(simActivities).forEach(([key, count]) => {
      if (scoringModel[key]) total += scoringModel[key] * (count || 0);
    });
    return total;
  }, [simActivities, scoringModel]);

  const calculateGrade = useMemo(() => {
    let steps = BASE_GRADE_INDEX;

    gradingRules.forEach((rule) => {
      const userValue = simProfile[rule.category];
      if (userValue && userValue.toLowerCase() === rule.value.toLowerCase()) {
        steps += rule.weight;
      }
    });

    steps = clamp(steps, 0, 12);
    return GRADE_LADDER[steps];
  }, [simProfile, gradingRules]);

  const isMQL = useMemo(() => {
    const gradeIndex = GRADE_LADDER.indexOf(calculateGrade);
    const thresholdIndex = GRADE_LADDER.indexOf(gradeThreshold);
    return calculateScore >= mqlThreshold && gradeIndex >= thresholdIndex;
  }, [calculateScore, calculateGrade, mqlThreshold, gradeThreshold]);

  // ----- Handlers -----
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

  const setThresholdFromAnyInput = (raw) => {
    const parsed = parseInt(raw, 10);
    const safe = Number.isFinite(parsed) ? parsed : 0;
    const stepped = roundToStep(safe, 5);
    setMqlThreshold(clamp(stepped, 0, 300));
  };

  // ----- UI Components -----
  const StepButton = ({ idx, step }) => {
    const Icon = step.icon;
    const isActive = idx === stepIndex;
    const isComplete = idx < stepIndex;

    return (
      <button
        onClick={() => setStepIndex(idx)}
        className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-sm font-medium transition-colors w-full sm:w-auto ${
          isActive
            ? "bg-blue-50 border-blue-200 text-blue-700"
            : isComplete
              ? "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
              : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
        }`}
      >
        <span
          className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
            isActive ? "bg-blue-600 text-white" : isComplete ? "bg-green-600 text-white" : "bg-slate-200 text-slate-700"
          }`}
        >
          {idx + 1}
        </span>
        <Icon size={18} />
        <span className="whitespace-nowrap">{step.title}</span>
      </button>
    );
  };

  const TopActions = () => (
    <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
      <div className="flex flex-wrap gap-2">
        {STEPS.map((s, idx) => (
          <StepButton key={s.id} idx={idx} step={s} />
        ))}
      </div>

      <div className="flex gap-2">
        <input
          ref={importInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => handleImportFile(e.target.files?.[0])}
        />
        <button
          onClick={triggerImport}
          className="px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          title="Import configuration (CSV)"
        >
          <Upload size={16} /> Import CSV
        </button>
        <button
          onClick={exportConfig}
          className="px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          title="Export configuration (JSON)"
        >
          <Download size={16} /> Export
        </button>
      </div>
    </div>
  );

  const StepFooter = () => (
    <div className="flex items-center justify-between pt-2">
      <button
        onClick={() => setStepIndex((i) => clamp(i - 1, 0, STEPS.length - 1))}
        disabled={stepIndex === 0}
        className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${
          stepIndex === 0
            ? "bg-slate-100 text-slate-400 cursor-not-allowed"
            : "bg-white border border-slate-200 hover:bg-slate-50 text-slate-700"
        }`}
      >
        <ArrowLeft size={16} /> Back
      </button>

      <button
        onClick={() => setStepIndex((i) => clamp(i + 1, 0, STEPS.length - 1))}
        disabled={stepIndex === STEPS.length - 1}
        className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${
          stepIndex === STEPS.length - 1
            ? "bg-slate-100 text-slate-400 cursor-not-allowed"
            : "bg-blue-600 hover:bg-blue-700 text-white"
        }`}
      >
        Next <ArrowRight size={16} />
      </button>
    </div>
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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <TopActions />

        {/* STEP 1: SCORING */}
        {activeStep === "scoring" && (
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
                  <div key={key} className="flex items-center justify-between group p-2 rounded-lg hover:bg-slate-50 transition-colors">
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

            <div className="px-6 pb-6">
              <StepFooter />
            </div>
          </div>
        )}

        {/* STEP 2: GRADING */}
        {activeStep === "grading" && (
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
              {gradingRules.length === 0 && <div className="text-center py-10 text-slate-400 italic">No grading rules defined yet.</div>}

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
                    <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Value (Exact Match)</label>
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

            <div className="px-6 pb-6">
              <StepFooter />
            </div>
          </div>
        )}

        {/* STEP 3: SIMULATOR */}
        {activeStep === "simulator" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                  <Settings size={18} className="text-slate-500" />
                  Global MQL Thresholds
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Minimum Score</label>

                    <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min="0"
                          max="300"
                          step="5"
                          value={mqlThreshold}
                          onChange={(e) => setThresholdFromAnyInput(e.target.value)}
                          className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                        />
                        <span className="w-14 text-center font-bold text-blue-600 bg-blue-50 py-1 rounded">{mqlThreshold}</span>
                      </div>

                      <div className="flex items-center gap-3">
                        <input
                          type="number"
                          min="0"
                          max="300"
                          step="5"
                          value={mqlThreshold}
                          onChange={(e) => setThresholdFromAnyInput(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <span className="text-xs text-slate-500 whitespace-nowrap">Step: 5</span>
                      </div>
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

              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                <StepFooter />
              </div>
            </div>

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
      </main>
    </div>
  );
}
