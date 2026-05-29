import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const app = express();
const PORT = 3000;

// Set up server-side limits. Max limit for base64 audio data.
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Interface representing a patient triage assessment
interface ClinicianSummary {
  primary_stressor: string;
  risk_level: string; // 'Low' | 'Medium' | 'High'
  clinical_notes: string;
  transcript: string;
  translated_transcript?: string; // New field for English translation of regional dialects
  clinical_score: number; // Strain / Distress Score strictly for clinician use, hidden from the patient
}

interface Assessment {
  id: string;
  timestamp: string;
  patient_response: string;
  clinician_summary: ClinicianSummary;
  crisis_trigger: boolean;
  acknowledged?: boolean;
}

// Memory database for assessments with detailed starter samples
let assessments: Assessment[] = [
  {
    id: "sample-1",
    timestamp: new Date(Date.now() - 3600000 * 24 * 2).toISOString(), // 2 days ago
    patient_response: "I hear how exhausted and overwhelmed you are right now. Balancing a demanding project without adequate support or sleep is extremely draining. Please give yourself permission to take brief breathing breaks, even just for 2 minutes, and remember that your survival does not depend on doing everything perfectly today. What is one tiny task we can take off your plate?",
    clinician_summary: {
      primary_stressor: "Work burnout",
      risk_level: "Low",
      clinical_notes: "Patient is experiencing physical and cognitive exhaustion secondary to excessive work demands. Sleep disturbance reported. Mood is anxious but maintains functional coping mechanisms. Denies suicidal ideation or intent. Recommended sleep hygiene and a follow-up consultation.",
      transcript: "I am just so tired and overwhelmed with my current project at work. I can't sleep properly, my mind is constantly racing, and I feel like I am letting everyone down. I just want to pause everything.",
      clinical_score: 35
    },
    crisis_trigger: false,
    acknowledged: false
  },
  {
    id: "sample-2",
    timestamp: new Date(Date.now() - 3600000 * 12).toISOString(), // 12 hours ago
    patient_response: "I am so deeply sorry for the loss of your mother. Grieving her while trying to manage daily responsibilities can feel like wading through deep water. The heavy chest and panic are your body crying out for space to feel. Please know you are not alone, and we can take this one slow breath at a time. Let's focus on grounding your feet on the floor right now.",
    clinician_summary: {
      primary_stressor: "Grief and panic",
      risk_level: "Medium",
      clinical_notes: "Patient presents with symptoms of traumatic bereavement and situational panic attacks following maternal death. Reports physical somatic anxiety (chest constriction). Main structural coping is compromised. Needs immediate supportive outpatient therapy and panic management tools. No active self-harm intent detected but high distress.",
      transcript: "Ever since my mother passed away last month, I can't breathe. I get these sudden panic attacks right before I leave my house for work. Everything feels dark and empty. I don't know how to survive without her.",
      clinical_score: 68
    },
    crisis_trigger: false,
    acknowledged: false
  },
  {
    id: "sample-3",
    timestamp: new Date(Date.now() - 3600000 * 2).toISOString(), // 2 hours ago
    patient_response: "I hear how much pain you are in, and I want to support you right now. Because you mentioned active ideas of ending your life and feeling like a burden, I need to make sure you have immediate help. I am displaying our trusted clinical lines, including Tele MANAS and National Emergency tools, directly in front of you. Please connect with them—your life matters, and there is help available right this instant.",
    clinician_summary: {
      primary_stressor: "Active suicidal ideation",
      risk_level: "High",
      clinical_notes: "CRITICAL ALERT: Patient reports severe distress, heavy worthlessness ('burden to everyone'), and active suicidal ideation with immediate intent. High lethality risk. Automatic lock screen crisis modal triggered. Family, emergency dispatch, or Tele MANAS intervention requires immediate clinical dispatch.",
      transcript: "I am such a burden to everyone around me. There is no point in trying anymore. Everyone would be better off without me. I am sitting alone in my bedroom and I just want to end it all tonight.",
      clinical_score: 96
    },
    crisis_trigger: true,
    acknowledged: false
  }
];


// 1. Get Triage Assessments History
app.get('/api/triage-history', (req, res) => {
  res.json(assessments);
});

// 2. Acknowledge Triage Crisis Escalation
app.post('/api/acknowledge-crisis', (req, res) => {
  const { id } = req.body;
  const assessment = assessments.find(a => a.id === id);
  if (assessment) {
    assessment.acknowledged = true;
    res.json({ success: true, assessment });
  } else {
    res.status(404).json({ error: "Assessment not found" });
  }
});

// 3. Clear Assessment Logs
app.delete('/api/clear-history', (req, res) => {
  // Keep the mock assessments or start empty. Let's reset to defaults.
  assessments = [
    {
      id: "sample-1",
      timestamp: new Date(Date.now() - 3600000 * 24 * 2).toISOString(),
      patient_response: "I hear how exhausted and overwhelmed you are right now. Balancing a demanding project without adequate support or sleep is extremely draining. Please give yourself permission to take brief breathing breaks, even just for 2 minutes, and remember that your survival does not depend on doing everything perfectly today.",
      clinician_summary: {
        primary_stressor: "Work burnout",
        risk_level: "Low",
        clinical_notes: "Patient is experiencing physical exhaustion secondary to excessive work demands. Mood is anxious but maintains functional coping mechanisms.",
        transcript: "I am just so tired and overwhelmed with my current project at work. I can't sleep properly, my mind is constantly racing, and I feel like I am letting everyone down. I just want to pause everything.",
        clinical_score: 35
      },
      crisis_trigger: false,
      acknowledged: false
    }
  ];
  res.json({ success: true, assessments });
});

// 3.5. Create Manual Assessment for New Patient Files
app.post('/api/manual-assessment', (req, res) => {
  const { patient_name, primary_stressor, risk_level, clinical_notes } = req.body;

  const newAssessment: Assessment = {
    id: "assess-" + Date.now(),
    timestamp: new Date().toISOString(),
    patient_response: `Clinician consultation logged for patient ${patient_name || 'Anonymous'}.`,
    clinician_summary: {
      primary_stressor: primary_stressor || "General Consult",
      risk_level: risk_level || "Low",
      clinical_notes: clinical_notes || "No notes logged.",
      transcript: `Clinician live interaction session logged.`,
      clinical_score: risk_level === 'High' ? 85 : risk_level === 'Medium' ? 55 : 25
    },
    crisis_trigger: risk_level === 'High',
    acknowledged: false
  };

  assessments.unshift(newAssessment);
  res.json(newAssessment);
});

// 4. Submit Journal (Text input routed directly to Vertex Gemma proxy)
app.post('/api/analyze-journal', async (req, res) => {
  const { text } = req.body;

  if (!text) {
    return res.status(400).json({ error: "Please input some journal text or record a voice session first." });
  }

  try {
    const transcriptText = text;

    // Cognitive Analysis & Triage Step via Vertex Gemma Proxy
    const proxyUrl = process.env.GEMMA_PROXY_URL || "http://127.0.0.1:8787/v1";
    const proxyModel = process.env.GEMMA_PROXY_MODEL || "google/gemma-4-26b-a4b-it-maas";

    // Setup the system instructions prompt
    const systemInstruction = `You are a dual-role clinical triage engine. You are designed to empathetically support patients in distress while generating professional clinical summaries and risk levels for medical practitioners.

You must return a strictly conforming JSON object according to the requested response schema. Do not output any markdown formatting (like \`\`\`json ... \`\`\`) or conversational preamble or postscript. Return ONLY the raw JSON object, starting with { and ending with }.

Response Schema Structure:
{
  "patient_response": "An empathetic response directly to the patient validating their experience. IMPORTANT: If the patient entry is in a regional Indian language (such as Hindi, Odia, Telugu, Tamil, Bengali, etc.), you MUST write this patient_response entirely in that same local language so they receive native-sounding support.",
  "clinician_summary": {
    "primary_stressor": "The primary psychological stressor identified from user input (formulated entirely in English, e.g. Workplace Burnout, Grief, Suicidal Ideation).",
    "risk_level": "Assessed level of clinical risk (in English). Must be one of: 'Low', 'Medium', or 'High'.",
    "clinical_notes": "Professional clinical formulation notes for medical practitioners (formulated entirely in English).",
    "transcript": "Verbatim transcript of the input exactly in the original language used by the patient.",
    "translated_transcript": "A complete, high-quality translation of the patient's transcript into English. If the patient already spoke/wrote in English, this field can be identical to the transcript or left empty.",
    "clinical_score": 50 // Clinical severity score indicating distress level from 1 (completely calm) to 100 (critical active distress).
  },
  "crisis_trigger": false // Set to true ONLY if there is an immediate risk of self-harm, active suicide intent, or physical danger.
}`;

    const userPrompt = `Here is the patient journal entry to analyze:
"${transcriptText}"

Provide the clinical assessment and empathetic response in the exact JSON format specified. Keep "transcript" in the response exactly as: "${transcriptText}".`;

    console.log(`[SwaraSaathi] Routing triage cognitive task to Gemma via local proxy: ${proxyUrl}/chat/completions (Model: ${proxyModel})`);

    let proxyResponse;
    try {
      proxyResponse = await fetch(`${proxyUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: proxyModel,
          messages: [
            { role: "system", content: systemInstruction },
            { role: "user", content: userPrompt }
          ],
          temperature: 0.2,
          response_format: { type: "json_object" } // Try to enforce JSON formatting
        })
      });

      if (proxyResponse.status === 400) {
        console.warn("[SwaraSaathi] 400 Bad Request with response_format, retrying without response_format...");
        proxyResponse = await fetch(`${proxyUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: proxyModel,
            messages: [
              { role: "system", content: systemInstruction },
              { role: "user", content: userPrompt }
            ],
            temperature: 0.2
          })
        });
      }
    } catch (fetchErr: any) {
      throw new Error(`Failed to connect to Vertex Gemma proxy at ${proxyUrl}. Ensure the proxy is running. Details: ${fetchErr.message}`);
    }

    if (!proxyResponse.ok) {
      const errorText = await proxyResponse.text();
      throw new Error(`Vertex Gemma Proxy Error (${proxyResponse.status}): ${errorText}`);
    }

    const proxyData = await proxyResponse.json();
    let resultText = proxyData.choices?.[0]?.message?.content?.trim();

    if (!resultText) {
      throw new Error("No response content returned from Gemma.");
    }

    // Clean up any potential markdown code blocks returned by Gemma
    if (resultText.startsWith("```")) {
      resultText = resultText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      resultText = resultText.trim();
    }

    console.log(`[SwaraSaathi] Successfully received response from Gemma. Length: ${resultText.length} characters.`);

    let parsedResult;
    try {
      parsedResult = JSON.parse(resultText);
    } catch (parseError) {
      console.error("[SwaraSaathi] JSON parsing failed. Raw response was:", resultText);
      throw new Error("Gemma did not return a valid JSON payload. Retrying or reviewing the prompt might be required.");
    }

    // Create new assessment record conforming strictly to our types
    const newAssessment: Assessment = {
      id: "assess-" + Date.now(),
      timestamp: new Date().toISOString(),
      patient_response: parsedResult.patient_response || "I hear you, and we are in this together.",
      clinician_summary: {
        primary_stressor: parsedResult.clinician_summary?.primary_stressor || "General stress",
        risk_level: parsedResult.clinician_summary?.risk_level || "Low",
        clinical_notes: parsedResult.clinician_summary?.clinical_notes || "No additional clinical notes recorded.",
        transcript: parsedResult.clinician_summary?.transcript || transcriptText,
        translated_transcript: parsedResult.clinician_summary?.translated_transcript || "",
        clinical_score: Number(parsedResult.clinician_summary?.clinical_score) || 50
      },
      crisis_trigger: !!parsedResult.crisis_trigger,
      acknowledged: false
    };

    assessments.unshift(newAssessment); // Add to the front of the list
    res.json(newAssessment);

  } catch (error: any) {
    console.error("Error in triage journal submission route:", error);
    
    // Provide a super friendly, helpful error message to let the user know what's going on,
    // and provide clear, actionable insights in the UI
    res.status(500).json({
      error: error.message || "An unidentified error occurred on the server.",
      details: "Check if the roo-vertex-gemma-proxy is active on http://127.0.0.1:8787/v1 and configured in .env."
    });
  }
});

// Setup Vite & Static Fallback middlewares
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[SwaraSaathi] Server successfully running at http://localhost:${PORT}`);
  });
}

startServer();
