import React, { useState, useEffect, useRef, FormEvent } from 'react';
import { 
  Mic, 
  Square, 
  Send, 
  Activity, 
  ShieldAlert, 
  Sparkles, 
  RefreshCw, 
  Search, 
  User, 
  Clock, 
  Trash2, 
  Volume2, 
  VolumeX, 
  FileText, 
  CheckCircle,
  AlertTriangle,
  Server,
  Filter,
  UserCheck,
  PhoneCall,
  Heart,
  ExternalLink
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ClinicianSummary {
  primary_stressor: string;
  risk_level: string; // 'Low', 'Medium', 'High'
  clinical_notes: string;
  transcript: string;
  translated_transcript?: string;
  clinical_score: number;
}

interface Assessment {
  id: string;
  timestamp: string;
  patient_response: string;
  clinician_summary: ClinicianSummary;
  crisis_trigger: boolean;
  acknowledged?: boolean;
}

// Helper functions to encode raw PCM Float32 audio samples into a standard 16-bit Mono PCM WAV Blob at 16,000 Hz.
function encodeWAV(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM format identifier
  view.setUint16(22, 1, true); // Mono (1 channel)
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // Byte rate
  view.setUint16(32, 2, true); // Block align
  view.setUint16(34, 16, true); // Bits per sample
  writeString(view, 36, 'data');
  view.setUint32(40, samples.length * 2, true);

  floatTo16BitPCM(view, 44, samples);

  return new Blob([view], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

function floatTo16BitPCM(output: DataView, offset: number, input: Float32Array) {
  for (let i = 0; i < input.length; i++, offset += 2) {
    let s = Math.max(-1, Math.min(1, input[i]));
    output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
}

export default function App() {
  // General Platform States
  const [activeTab, setActiveTab] = useState<'patient' | 'clinician'>('patient');
  const [triageHistory, setTriageHistory] = useState<Assessment[]>([]);
  const [isApiKeyMissing, setIsApiKeyMissing] = useState<boolean>(false);
  
  // Patient View States
  const [journalText, setJournalText] = useState<string>('');
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const [micVolume, setMicVolume] = useState<number>(0);
  const [micError, setMicError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [patientResponseBubble, setPatientResponseBubble] = useState<Assessment | null>(null);
  
  // Crisis Modal States
  const [showCrisisModal, setShowCrisisModal] = useState<boolean>(false);
  const [crisisAssessment, setCrisisAssessment] = useState<Assessment | null>(null);
  const [ttsPlaying, setTtsPlaying] = useState<boolean>(false);

  // Clinician Dashboard States
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [riskFilter, setRiskFilter] = useState<'All' | 'Low' | 'Medium' | 'High'>('All');
  const [activeCardId, setActiveCardId] = useState<string | null>(null);

  // Clinician Interaction Recording States
  const [isClinicianRecording, setIsClinicianRecording] = useState<boolean>(false);
  const [clinicianRecordingSeconds, setClinicianRecordingSeconds] = useState<number>(0);
  const [clinicianTranscript, setClinicianTranscript] = useState<string>('');
  const [clinicianAudioUrl, setClinicianAudioUrl] = useState<string | null>(null);
  const [recordingTargetPatientId, setRecordingTargetPatientId] = useState<string>('');
  const [notesSaveStatus, setNotesSaveStatus] = useState<string | null>(null);
  const [isCreatingNewPatient, setIsCreatingNewPatient] = useState<boolean>(false);
  const [newPatientName, setNewPatientName] = useState<string>('');
  const [newPatientStressor, setNewPatientStressor] = useState<string>('');
  const [newPatientRisk, setNewPatientRisk] = useState<'Low' | 'Medium' | 'High'>('Low');
  const [patientLanguage, setPatientLanguage] = useState<string>('en-US');
  const [clinicianLanguage, setClinicianLanguage] = useState<string>('en-US');

  // Speech Recognition and Visualizer Refs
  const recognitionRef = useRef<any>(null);
  const visualizerIntervalRef = useRef<any>(null);
  const recordingTimerRef = useRef<any>(null);
  const accumulatedTextRef = useRef<string>("");

  // Clinician Session Recorder Refs
  const clinicianRecognitionRef = useRef<any>(null);
  const clinicianMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const clinicianAudioChunksRef = useRef<Blob[]>([]);
  const clinicianTimerRef = useRef<any>(null);

  // Initialize and Fetch triage history
  useEffect(() => {
    fetchHistory();
    // Set up polling interval to fetch clinician logs
    const interval = setInterval(fetchHistory, 10000); // Poll every 10s
    return () => clearInterval(interval);
  }, []);

  // Update recording timer
  useEffect(() => {
    if (isRecording) {
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);
    } else {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      setRecordingSeconds(0);
    }
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };
  }, [isRecording]);

  const fetchHistory = async () => {
    try {
      const res = await fetch('/api/triage-history');
      if (res.ok) {
        const data = await res.json();
        setTriageHistory(data);
        // Clean key missing state if history gets fetched perfectly
        setIsApiKeyMissing(false);
      }
    } catch (err) {
      console.error("Failed to load triage assessments history:", err);
    }
  };

  // Convert seconds to readable min:sec
  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remaining = secs % 60;
    return `${mins}:${remaining.toString().padStart(2, '0')}`;
  };

  // Browser Speech Recognition Handlers (Infinite Continuous Capture Gap Fix)
  const startRecording = () => {
    setMicError(null);
    setPatientResponseBubble(null);
    setJournalText("");
    accumulatedTextRef.current = "";

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setMicError("Speech recognition is not supported in this browser. Please type your journal instead.");
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = patientLanguage;

      recognition.onstart = () => {
        setIsRecording(true);
        setRecordingSeconds(0);
        
        // Start simulated volume visualizer for animated visual feedback
        visualizerIntervalRef.current = setInterval(() => {
          setMicVolume(20 + Math.random() * 60);
        }, 100);
      };

      recognition.onerror = (event: any) => {
        console.error("Speech recognition error:", event.error);
        if (event.error === 'not-allowed') {
          setMicError("Microphone access denied. Please check your browser microphone permissions.");
        } else {
          setMicError(`Speech recognition error: ${event.error}`);
        }
        setIsRecording(false);
        if (visualizerIntervalRef.current) {
          clearInterval(visualizerIntervalRef.current);
          visualizerIntervalRef.current = null;
        }
        setMicVolume(0);
      };

      recognition.onend = () => {
        // Auto-restart loop to record for as long as they can
        const active = (document.getElementById("patient-recording-active") as HTMLInputElement)?.value === "true";
        if (active) {
          console.log("[Patient Voice Recorder] Auto-restarting recognition for infinite recording...");
          try {
            recognition.start();
          } catch (e) {
            console.error("[Patient Voice Recorder] Auto-restart failed:", e);
          }
        } else {
          setIsRecording(false);
          if (visualizerIntervalRef.current) {
            clearInterval(visualizerIntervalRef.current);
            visualizerIntervalRef.current = null;
          }
          setMicVolume(0);
        }
      };

      recognition.onresult = (event: any) => {
        let finalTranscript = "";
        let interimTranscript = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }
        
        if (finalTranscript) {
          accumulatedTextRef.current += finalTranscript + " ";
        }
        
        const displayedText = accumulatedTextRef.current + interimTranscript;
        if (displayedText) {
          setJournalText(displayedText);
        }
      };

      // Set helper element to keep it alive
      let helper = document.getElementById("patient-recording-active") as HTMLInputElement;
      if (!helper) {
        helper = document.createElement("input");
        helper.type = "hidden";
        helper.id = "patient-recording-active";
        document.body.appendChild(helper);
      }
      helper.value = "true";

      recognitionRef.current = recognition;
      recognition.start();
    } catch (e: any) {
      console.error("Speech recognition start failed:", e);
      setMicError(`Speech recognition start failed: ${e.message}`);
    }
  };

  const stopRecording = () => {
    const helper = document.getElementById("patient-recording-active") as HTMLInputElement;
    if (helper) helper.value = "false";

    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsRecording(false);
      
      if (visualizerIntervalRef.current) {
        clearInterval(visualizerIntervalRef.current);
        visualizerIntervalRef.current = null;
      }
      setMicVolume(0);

      // Wait a brief moment to ensure speech recognition outputs final tokens
      setTimeout(() => {
        const inputEl = document.getElementById("journal-input") as HTMLTextAreaElement;
        const speechText = inputEl ? inputEl.value : journalText;
        if (speechText.trim()) {
          submitJournal({ text: speechText.trim() });
        } else {
          setMicError("No speech was detected. Please try speaking clearly or typing your journal instead.");
        }
      }, 600);
    }
  };

  // Clinician Interaction Recording Session Handlers (up to 30 mins, continuous loop)
  const startClinicianRecording = async () => {
    setClinicianTranscript("");
    setClinicianAudioUrl(null);
    setNotesSaveStatus(null);
    clinicianAudioChunksRef.current = [];

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    let recognition: any = null;
    
    if (SpeechRecognition) {
      recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = clinicianLanguage;

      recognition.onstart = () => {
        console.log("[Clinician Voice Recorder] Speech Recognition started.");
      };

      recognition.onerror = (event: any) => {
        console.error("[Clinician Voice Recorder] Speech recognition error:", event.error);
      };

      recognition.onend = () => {
        // Auto-restart loop to support up to 30 mins sessions
        const active = (document.getElementById("clinician-recording-active") as HTMLInputElement)?.value === "true";
        if (active) {
          console.log("[Clinician Voice Recorder] Auto-restarting recognition for long session...");
          try {
            recognition.start();
          } catch (e) {
            console.error("[Clinician Voice Recorder] Auto-restart failed:", e);
          }
        }
      };

      let accumulatedClinicianText = "";
      recognition.onresult = (event: any) => {
        let finalTranscript = "";
        let interimTranscript = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }
        
        if (finalTranscript) {
          accumulatedClinicianText += finalTranscript + " ";
        }
        setClinicianTranscript(accumulatedClinicianText + interimTranscript);
      };

      clinicianRecognitionRef.current = recognition;
    }

    try {
      // Record raw audio using browser MediaRecorder API
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      clinicianMediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          clinicianAudioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(clinicianAudioChunksRef.current, { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(audioBlob);
        setClinicianAudioUrl(audioUrl);
        
        // Stop audio capture tracks
        stream.getTracks().forEach(track => track.stop());
      };

      setIsClinicianRecording(true);
      setClinicianRecordingSeconds(0);

      // Start timer
      clinicianTimerRef.current = setInterval(() => {
        setClinicianRecordingSeconds(prev => {
          if (prev >= 1800) { // Limit to 30 minutes (1800 seconds)
            stopClinicianRecording();
            return 1800;
          }
          return prev + 1;
        });
      }, 1000);

      // Set helper element to keep it alive
      let helper = document.getElementById("clinician-recording-active") as HTMLInputElement;
      if (!helper) {
        helper = document.createElement("input");
        helper.type = "hidden";
        helper.id = "clinician-recording-active";
        document.body.appendChild(helper);
      }
      helper.value = "true";

      // Launch both media capturing nodes
      if (recognition) recognition.start();
      mediaRecorder.start();

    } catch (e: any) {
      console.error("[Clinician Voice Recorder] Failed to capture microphone for session recording:", e);
      alert(`Could not start session recording: ${e.message}. Please verify browser microphone permissions.`);
    }
  };

  const stopClinicianRecording = () => {
    setIsClinicianRecording(false);
    
    const helper = document.getElementById("clinician-recording-active") as HTMLInputElement;
    if (helper) helper.value = "false";

    if (clinicianTimerRef.current) {
      clearInterval(clinicianTimerRef.current);
      clinicianTimerRef.current = null;
    }

    if (clinicianRecognitionRef.current) {
      clinicianRecognitionRef.current.stop();
    }

    if (clinicianMediaRecorderRef.current && clinicianMediaRecorderRef.current.state !== 'inactive') {
      clinicianMediaRecorderRef.current.stop();
    }
  };

  const saveSessionNotes = () => {
    if (!recordingTargetPatientId) {
      alert("Please select a target patient to log this interaction to.");
      return;
    }

    const patient = triageHistory.find(h => h.id === recordingTargetPatientId);
    if (!patient) {
      alert("Selected patient not found.");
      return;
    }

    // Append session notes with timestamp
    const sessionDetails = `\n\n[Recorded Interaction Notes - ${new Date().toLocaleDateString()}] \nSession Transcript:\n"${clinicianTranscript || 'No transcript generated.'}"`;
    patient.clinician_summary.clinical_notes += sessionDetails;
    
    // Update local history
    setTriageHistory([...triageHistory]);
    setNotesSaveStatus(`Interaction successfully logged to patient record!`);
    
    setTimeout(() => {
      setNotesSaveStatus(null);
    }, 4000);
  };

  const saveManualSessionNotes = async () => {
    if (isCreatingNewPatient && !newPatientName.trim()) {
      alert("Please enter a patient name or identifier.");
      return;
    }

    try {
      if (isCreatingNewPatient) {
        // Create new patient assessment on the backend
        const response = await fetch('/api/manual-assessment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            patient_name: newPatientName.trim(),
            primary_stressor: newPatientStressor.trim() || "General Consult",
            risk_level: newPatientRisk,
            clinical_notes: `Clinician Live Session Notes (${new Date().toLocaleDateString()}): \n"${clinicianTranscript || 'No transcript recorded.'}"`
          })
        });

        if (response.ok) {
          await fetchHistory();
          setNotesSaveStatus(`New patient "${newPatientName}" created and session logged successfully!`);
          
          // Reset creation form
          setIsCreatingNewPatient(false);
          setNewPatientName("");
          setNewPatientStressor("");
          setNewPatientRisk("Low");
          setRecordingTargetPatientId("");
        } else {
          alert("Failed to create manual patient record.");
        }
      } else {
        // Logic for existing patient
        saveSessionNotes();
      }
    } catch (e: any) {
      console.error("Failed to save session notes:", e);
      alert(`Error saving notes: ${e.message}`);
    } finally {
      setTimeout(() => {
        setNotesSaveStatus(null);
      }, 4000);
    }
  };




  // Submit Text or Audio voice to Express backend
  const submitJournal = async (payload: { text?: string; audio?: string; mimeType?: string }) => {
    setIsSubmitting(true);
    setPatientResponseBubble(null);
    setMicError(null);
    setIsApiKeyMissing(false);
    
    try {
      const response = await fetch('/api/analyze-journal', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        if (data.isApiKeyError) {
          setIsApiKeyMissing(true);
        }
        throw new Error(data.error || "Failed to analyze state metrics.");
      }
      
      // Update historical logs in UI
      await fetchHistory();
      
      if (data.crisis_trigger) {
        setCrisisAssessment(data);
        setShowCrisisModal(true);
      } else {
        setPatientResponseBubble(data);
      }
      
      // Reset text inputs
      setJournalText("");
      
    } catch (err: any) {
      console.error("Triage sub error:", err);
      setMicError(`Submission Failed: ${err.message || 'Check connection settings.'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTextSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!journalText.trim()) return;
    submitJournal({ text: journalText.trim() });
  };

  // Speak Patient Response aloud via Browser Speech Synthesis
  const toggleSpeechSynthesis = (text: string) => {
    if (ttsPlaying) {
      window.speechSynthesis.cancel();
      setTtsPlaying(false);
    } else {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.onend = () => setTtsPlaying(false);
      utterance.onerror = () => setTtsPlaying(false);
      
      // Try using a comforting, soft voice option if available
      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find(v => v.name.includes("Google") || v.name.includes("Natural"));
      if (preferred) utterance.voice = preferred;
      
      setTtsPlaying(true);
      window.speechSynthesis.speak(utterance);
    }
  };

  // Acknowledge a crisis case on the Express node
  const handleAcknowledge = async (id: string) => {
    try {
      const res = await fetch('/api/acknowledge-crisis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      if (res.ok) {
        await fetchHistory();
      }
    } catch (err) {
      console.error("Escalation action error:", err);
    }
  };

  const handleClearLogs = async () => {
    if (confirm("Reset clinical triage logs to mock defaults? This will erase current session entries.")) {
      try {
        const res = await fetch('/api/clear-history', { method: 'DELETE' });
        if (res.ok) {
          await fetchHistory();
          setPatientResponseBubble(null);
        }
      } catch (err) {
        console.error("Cleaning error:", err);
      }
    }
  };

  // Clinical Dashboard Filters and Searches
  const filteredTriage = triageHistory.filter(item => {
    const summary = item.clinician_summary;
    const matchesSearch = 
      summary.primary_stressor.toLowerCase().includes(searchQuery.toLowerCase()) ||
      summary.clinical_notes.toLowerCase().includes(searchQuery.toLowerCase()) ||
      summary.transcript.toLowerCase().includes(searchQuery.toLowerCase());
      
    if (riskFilter === 'All') return matchesSearch;
    return matchesSearch && summary.risk_level.toLowerCase() === riskFilter.toLowerCase();
  });

  // Calculate quick metrics for Clinician Dashboard
  const analytics = {
    total: triageHistory.length,
    highRisk: triageHistory.filter(h => h.clinician_summary.risk_level.toLowerCase() === 'high').length,
    mediumRisk: triageHistory.filter(h => h.clinician_summary.risk_level.toLowerCase() === 'medium').length,
    lowRisk: triageHistory.filter(h => h.clinician_summary.risk_level.toLowerCase() === 'low').length,
    unacknowledgedCrisis: triageHistory.filter(h => h.crisis_trigger && !h.acknowledged).length,
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col font-sans text-[#1A1A1A] selection:bg-[#E1EFFF] selection:text-[#1A1A1A] overflow-x-hidden">
      
      {/* 1. Global View Navigation Toggle Bar (at the absolute top of the page) */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#E5E5E5] px-6 py-4 shrink-0">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          
          {/* Brand/Product Name (Strict, Non-marketing, Humble name) */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#4A90E2] rounded-full flex items-center justify-center shadow-xs shrink-0">
              <div className="w-4 h-4 bg-white rounded-xs rotate-45"></div>
            </div>
            <div>
              <h1 className="font-display italic text-xl tracking-tight text-[#1A1A1A]">
                SwaraSaathi <span className="text-[#A0A0A0] font-sans text-xs uppercase tracking-widest font-semibold ml-1">AI Triage</span>
              </h1>
              <p className="text-[10px] text-[#A0A0A0] uppercase tracking-wider font-mono font-medium leading-none mt-0.5">Dual-Purpose Support Core</p>
            </div>
          </div>

          {/* Simple toggle at the absolute top of the page to switch between "Patient View" and "Clinician View" */}
          <div className="flex bg-[#F0F2F5] p-1 rounded-full border border-slate-200/20">
            <button
              id="btn-switch-patient"
              onClick={() => {
                setActiveTab('patient');
                setPatientResponseBubble(null);
                setMicVolume(0);
              }}
              className={`flex items-center gap-2 px-6 py-1.5 text-xs font-semibold rounded-full transition-all duration-300 cursor-pointer ${
                activeTab === 'patient' 
                  ? 'bg-white text-[#1A1A1A] shadow-sm' 
                  : 'text-[#666] hover:text-[#1A1A1A]'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              Patient Portal
            </button>
            <button
              id="btn-switch-clinician"
              onClick={() => {
                setActiveTab('clinician');
                fetchHistory();
              }}
              className={`flex items-center gap-2 px-6 py-1.5 text-xs font-semibold rounded-full transition-all duration-300 relative cursor-pointer ${
                activeTab === 'clinician' 
                  ? 'bg-white text-[#1A1A1A] shadow-sm' 
                  : 'text-[#666] hover:text-[#1A1A1A]'
              }`}
            >
              <Server className="w-3.5 h-3.5" />
              Clinician View
              {analytics.unacknowledgedCrisis > 0 && (
                <span className="absolute top-1 right-2 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Container Workspace */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-6 py-6 md:py-10">

        {/* 2. API Key Error Notice Block */}
        {isApiKeyMissing && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3.5 max-w-xl mx-auto"
          >
            <ShieldAlert className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-red-900 text-sm">Gemini API Key Needed</h3>
              <p className="text-xs text-red-700 leading-relaxed mt-1">
                The Gemini model requires an active API key to process transcripts and sentiment categories.
                Please add the <strong>GEMINI_API_KEY</strong> environment variable in your AI Studio 
                <strong> Settings &gt; Secrets</strong> tab of the compiler client.
              </p>
              <div className="mt-2.5 flex items-center gap-4">
                <span className="text-[10px] font-semibold font-mono bg-red-100 text-red-800 px-2 py-0.5 rounded uppercase">Action Required</span>
              </div>
            </div>
          </motion.div>
        )}

        <AnimatePresence mode="wait">
          {/* ======================================= */}
          {/* PATIENT VIEW (Mobile-First, Calming Vibe) */}
          {/* ======================================= */}
          {activeTab === 'patient' && (
            <motion.div
              key="patient-view"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.3 }}
              className="max-w-xl mx-auto flex flex-col items-center"
            >
              {/* Introduction Card */}
              <div className="text-center mb-10 w-full">
                <div className="space-y-4">
                  <h1 className="font-display text-5xl leading-tight text-[#1A1A1A] font-medium tracking-tight">Good morning,<br />Sarah.</h1>
                  <p className="text-[#666] leading-relaxed max-w-md mx-auto text-[14px]">
                    How are you feeling today? Your journal is your confidential space for reflection. Express your mind verbally or in writing below.
                  </p>
                </div>
              </div>

              {/* Language Selector Dropdown (Patient Portal) */}
              <div className="w-full flex items-center justify-between gap-3 mb-6 px-5 py-3 bg-white rounded-2xl border border-slate-200/60 shadow-2xs max-w-sm">
                <span className="text-xs text-slate-500 font-bold uppercase tracking-wider font-mono">Journal Language</span>
                <select
                  value={patientLanguage}
                  onChange={(e) => setPatientLanguage(e.target.value)}
                  disabled={isRecording}
                  className="bg-transparent text-xs font-semibold text-[#4A90E2] cursor-pointer outline-none focus:ring-0"
                >
                  <option value="en-US">English (US)</option>
                  <option value="hi-IN">Hindi (हिन्दी)</option>
                  <option value="or-IN">Odia (ଓଡ଼ିଆ)</option>
                  <option value="te-IN">Telugu (తెలుగు)</option>
                  <option value="ta-IN">Tamil (தமிழ்)</option>
                </select>
              </div>

              {/* Patient Voice Journal Recording Space */}
              <button
                id="btn-record-voice"
                onClick={isRecording ? stopRecording : startRecording}
                className="w-full group flex flex-col items-center justify-center py-14 border-2 border-dashed border-[#4A90E2] rounded-3xl bg-[#F0F7FF] hover:bg-[#E1EFFF] transition-all duration-300 relative focus:outline-none cursor-pointer mb-6"
              >
                {isRecording && (
                  <span className="absolute inset-0 rounded-3xl bg-[#4A90E2]/5 animate-pulse" />
                )}
                
                {/* Visualizer waves inside button if recording */}
                {isRecording ? (
                  <div className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center mb-4 shadow-lg shadow-red-200 animate-pulse">
                    <Square className="w-6 h-6 text-white" />
                  </div>
                ) : (
                  <div className="w-16 h-16 bg-[#4A90E2] rounded-full flex items-center justify-center mb-4 shadow-lg shadow-blue-200/40 group-hover:scale-105 transition-transform duration-300">
                    <Mic className="w-6 h-6 text-white" />
                  </div>
                )}
                
                {isRecording ? (
                  <>
                    <span className="text-red-600 font-semibold tracking-wider uppercase text-xs">Recording Voice...</span>
                    <span className="text-red-500/80 text-xs mt-1.5 font-mono">{formatTime(recordingSeconds)} &bull; Tap to stop & submit</span>
                  </>
                ) : (
                  <>
                    <span className="text-[#4A90E2] font-semibold tracking-wide text-sm">Record Voice Journal</span>
                    <span className="text-[#4A90E2]/60 text-xs mt-1">Tap to start speaking</span>
                  </>
                )}

                {/* Micro visualizer lines under button text only when recording */}
                {isRecording && micVolume > 0 && (
                  <div className="flex items-center gap-1.5 mt-5">
                    {[...Array(8)].map((_, i) => {
                      const h = 4 + Math.random() * (micVolume * 0.5 || 15);
                      return (
                        <span 
                          key={i} 
                          className="w-1 rounded-full bg-red-600/70"
                          style={{ height: `${h}px` }}
                        />
                      );
                    })}
                  </div>
                )}
              </button>

              {micError && (
                <div className="w-full mb-6 text-xs font-semibold text-red-600 bg-red-50 p-3.5 rounded-2xl border border-red-100 text-center leading-relaxed">
                  {micError}
                </div>
              )}

              {/* Text Area Form */}
              <div className="w-full relative mb-8">
                <form id="patient-text-form" onSubmit={handleTextSubmit} className="relative">
                  <textarea
                    id="journal-input"
                    value={journalText}
                    onChange={(e) => setJournalText(e.target.value)}
                    placeholder="Or type your journal here..."
                    disabled={isRecording || isSubmitting}
                    className="w-full h-36 p-5 bg-white focus:bg-white rounded-2xl border-none focus:ring-1 focus:ring-[#4A90E2] resize-none text-[14px] placeholder-[#999] outline-none text-[#1A1A1A] leading-relaxed transition-all pr-36 shadow-xs"
                  />
                  <button
                    id="btn-submit-journal"
                    type="submit"
                    disabled={isSubmitting || !journalText.trim() || isRecording}
                    className="absolute bottom-4 right-4 bg-[#1A1A1A] text-white hover:bg-slate-800 disabled:bg-slate-100 disabled:text-slate-400 text-[10px] px-5 py-2 rounded-full font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer shadow-xs"
                  >
                    {isSubmitting ? "Sending..." : "Submit to Gemma"}
                  </button>
                </form>
              </div>

              {/* Submission Analysis / Skeleton State */}
              {isSubmitting && (
                <div id="loading-assessment" className="w-full bg-[#F0F7FF] border border-[#D0E3F7]/80 rounded-2xl p-8 shadow-2xs text-center border-dashed py-14 animate-pulse mb-8">
                  <div className="inline-flex p-3 bg-white text-[#4A90E2] rounded-full mb-4 shadow-3xs">
                    <Sparkles className="w-5 h-5 animate-spin" />
                  </div>
                  <h4 className="font-semibold text-xs uppercase tracking-widest text-[#4A90E2]">Processing Journal Analysis</h4>
                  <p className="text-xs text-slate-500 mt-2 max-w-sm mx-auto font-serif leading-relaxed italic">
                    Gemma AI is processing raw entry metrics, drafting clinical supportive insights, and formulating safe triage routes.
                  </p>
                </div>
              )}

              {/* 3. Empathetic Support Output Bubble (Pristine Editorial style) */}
              {patientResponseBubble && (
                <motion.div
                  id="patient-response-card"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="w-full bg-[#F0F7FF] p-6 rounded-2xl border border-[#D0E3F7] relative mb-8"
                >
                  <div className="flex items-center justify-between mb-4 border-b border-[#D0E3F7] pb-3">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-[#4A90E2] font-bold">Gemma's Response</p>
                    
                    <button
                      id="btn-voice-tts"
                      onClick={() => toggleSpeechSynthesis(patientResponseBubble.patient_response)}
                      className={`text-[9px] font-bold uppercase tracking-wider flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-full border border-blue-200 transition-all cursor-pointer ${
                        ttsPlaying ? 'text-red-500 border-red-200 bg-red-50 animate-pulse' : 'text-[#4A90E2] hover:bg-blue-50'
                      }`}
                    >
                      {ttsPlaying ? (
                        <>
                          <VolumeX className="w-3 h-3" />
                          Stop audio
                        </>
                      ) : (
                        <>
                          <Volume2 className="w-3 h-3" />
                          Listen aloud
                        </>
                      )}
                    </button>
                  </div>
                  
                  <p className="text-sm italic font-serif text-[#334E68] leading-relaxed">
                    "{patientResponseBubble.patient_response}"
                  </p>

                  <div className="mt-4 pt-3 border-t border-[#D0E3F7] flex justify-between items-center text-[9px] font-mono font-semibold text-blue-500/70">
                    <span>TRIAGE CODE CLASSIFIED</span>
                    <span className="font-bold tracking-widest uppercase">RISK ASSESSMENT: {patientResponseBubble.clinician_summary.risk_level}</span>
                  </div>
                </motion.div>
              )}

              {/* Patient Safety disclaimer badge */}
              <div className="flex items-center justify-center gap-2.5 text-[11px] text-[#888] bg-white hover:bg-slate-50/50 px-5 py-3 rounded-2xl border border-slate-200/60 max-w-sm shadow-2xs font-serif italic text-center transition-colors">
                <Heart className="w-3.5 h-3.5 text-red-400 shrink-0" />
                <span>SwaraSaathi self-help metrics do not substitute critical human therapy.</span>
              </div>

            </motion.div>
          )}

          {/* ======================================= */}
          {/* CLINICIAN VIEW (Responsive Dashboard) */}
          {/* ======================================= */}
          {activeTab === 'clinician' && (
            <motion.div
              key="clinician-view"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.3 }}
              className="space-y-6"
            >
              {/* Diagnostic Overview Metric Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                
                <div className="bg-white p-6 rounded-2xl border border-[#E5E5E5] shadow-xs">
                  <div className="flex justify-between items-start">
                    <span className="text-[10px] text-[#A0A0A0] uppercase font-bold tracking-widest font-mono">Total Cases</span>
                    <span className="p-1 text-[#4A90E2]"><Activity className="w-4 h-4" /></span>
                  </div>
                  <h3 className="text-3xl font-serif text-[#1A1A1A] mt-2">{analytics.total}</h3>
                  <p className="text-[10px] text-[#666] mt-1 font-sans">Active queue files</p>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-red-200 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1.5 h-full bg-red-600" />
                  <div className="flex justify-between items-start">
                    <span className="text-[10px] text-red-500 uppercase font-bold tracking-widest font-mono">Critical</span>
                    <span className="p-1 text-red-600 shrink-0"><ShieldAlert className="w-4 h-4 animate-bounce" /></span>
                  </div>
                  <h3 className="text-3xl font-serif text-red-600 mt-2">{analytics.highRisk}</h3>
                  <p className="text-[10px] text-red-500 mt-1 font-semibold uppercase tracking-wider">Urgent triage alert</p>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-[#E5E5E5] shadow-xs">
                  <div className="flex justify-between items-start">
                    <span className="text-[10px] text-[#A0A0A0] uppercase font-bold tracking-widest font-mono">Medium</span>
                    <span className="p-1 text-orange-500"><AlertTriangle className="w-4 h-4" /></span>
                  </div>
                  <h3 className="text-3xl font-serif text-orange-600 mt-2">{analytics.mediumRisk}</h3>
                  <p className="text-[10px] text-[#666] mt-1 font-sans">Clinical follow-ups</p>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-[#E5E5E5] shadow-xs">
                  <div className="flex justify-between items-start">
                    <span className="text-[10px] text-[#A0A0A0] uppercase font-bold tracking-widest font-mono">Low Risk</span>
                    <span className="p-1 text-green-500"><CheckCircle className="w-4 h-4" /></span>
                  </div>
                  <h3 className="text-3xl font-serif text-green-600 mt-2">{analytics.lowRisk}</h3>
                  <p className="text-[10px] text-[#666] mt-1 font-sans">Self-guided advice</p>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-[#E5E5E5] shadow-xs col-span-2 lg:col-span-1 flex flex-col justify-between">
                  <div>
                    <h4 className="text-[10px] text-[#A0A0A0] uppercase font-bold tracking-widest font-mono">Database</h4>
                    <p className="text-xs text-[#666] mt-1 font-serif italic">Administrator control</p>
                  </div>
                  <button
                    id="btn-clear-logs"
                    onClick={handleClearLogs}
                    className="mt-3 py-1.5 border border-[#E5E5E5] text-[#1A1A1A] hover:bg-red-50 hover:text-red-600 hover:border-red-200 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-colors cursor-pointer"
                  >
                    Reset System
                  </button>
                </div>
              </div>

              {/* Search & Filter Toolbar */}
              <div className="bg-white rounded-2xl border border-[#E5E5E5] p-5 flex flex-col md:flex-row items-center justify-between gap-4">
                
                {/* Search Bar */}
                <div className="relative w-full md:w-80">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-[#A0A0A0] pointer-events-none">
                    <Search className="w-4 h-4" />
                  </span>
                  <input
                    id="search-assessments"
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search stressors, clinical notes..."
                    className="w-full pl-9 pr-4 py-2.5 bg-[#F8F9FA] text-[#1A1A1A] placeholder-[#999] border-none rounded-xl text-xs focus:bg-white focus:ring-1 focus:ring-[#4A90E2] transition-all outline-none"
                  />
                </div>

                {/* Filter Buttons */}
                <div className="flex items-center gap-4 w-full md:w-auto overflow-x-auto pb-1 md:pb-0 justify-between md:justify-end">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-[#A0A0A0] font-bold uppercase tracking-widest font-sans flex items-center gap-1.5 select-none whitespace-nowrap">
                      <Filter className="w-3.5 h-3.5 text-[#A0A0A0]" />
                      Filter:
                    </span>
                    
                    <div className="flex items-center gap-1 bg-[#F0F2F5] p-1 rounded-full">
                      {(['All', 'Low', 'Medium', 'High'] as const).map((r) => (
                        <button
                          key={r}
                          onClick={() => setRiskFilter(r)}
                          className={`px-4 py-1 text-[10px] font-bold rounded-full transition-all cursor-pointer ${
                            riskFilter === r 
                              ? 'bg-white text-[#1A1A1A] shadow-xs' 
                              : 'text-[#666] hover:text-[#1A1A1A]'
                          }`}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    id="btn-refresh-history"
                    onClick={fetchHistory}
                    className="p-2 border border-[#E5E5E5] bg-white hover:bg-[#F8F9FA] text-[#1A1A1A] hover:text-[#4A90E2] rounded-xl transition-all flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer whitespace-nowrap"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Reload
                  </button>
              </div>
              </div>

              {/* Live Session Recording & Interaction Logger Module */}
              <div className="bg-white rounded-2xl border border-[#E5E5E5] p-6 shadow-sm">
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6 pb-4 border-b border-[#E5E5E5]">
                  <div>
                    <h3 className="text-lg font-serif text-[#1A1A1A] flex items-center gap-2">
                      <span className="w-2.5 h-2.5 bg-[#4A90E2] rounded-full"></span>
                      Clinician Live Session Recorder
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                      Record clinical interactions and generate real-time patient notes. Supports continuous sessions up to 30 minutes.
                    </p>
                  </div>
                  
                  {/* Status Indicator */}
                  {isClinicianRecording && (
                    <div className="flex items-center gap-2 px-3 py-1 bg-red-50 border border-red-200 text-red-600 rounded-full text-[10px] font-bold uppercase tracking-wider animate-pulse">
                      <span className="w-2 h-2 bg-red-600 rounded-full animate-ping"></span>
                      Recording Live Interaction: {formatTime(clinicianRecordingSeconds)}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Left Column: Recording Controls */}
                  <div className="flex flex-col justify-between p-4 bg-[#F8F9FA] rounded-2xl border border-slate-200/50">
                    <div>
                      <div className="mb-4">
                        <label className="text-[10px] text-[#A0A0A0] uppercase font-bold tracking-widest font-mono block mb-2">Session Language</label>
                        <select
                          value={clinicianLanguage}
                          onChange={(e) => setClinicianLanguage(e.target.value)}
                          disabled={isClinicianRecording}
                          className="w-full px-3 py-2 bg-white text-xs border border-slate-200 rounded-xl outline-none focus:ring-1 focus:ring-[#4A90E2] cursor-pointer font-semibold"
                        >
                          <option value="en-US">English (US)</option>
                          <option value="hi-IN">Hindi (हिन्दी)</option>
                          <option value="or-IN">Odia (ଓଡ଼ିଆ)</option>
                          <option value="te-IN">Telugu (తెలుగు)</option>
                          <option value="ta-IN">Tamil (தமிழ்)</option>
                        </select>
                      </div>

                      <div className="flex justify-between items-center mb-2">
                        <label className="text-[10px] text-[#A0A0A0] uppercase font-bold tracking-widest font-mono block">Associate with Patient</label>
                        <button
                          type="button"
                          onClick={() => {
                            setIsCreatingNewPatient(!isCreatingNewPatient);
                            setRecordingTargetPatientId("");
                          }}
                          disabled={isClinicianRecording}
                          className="text-[10px] text-[#4A90E2] hover:text-blue-700 font-bold uppercase cursor-pointer transition-colors"
                        >
                          {isCreatingNewPatient ? "« Choose Existing" : "+ Add New Patient"}
                        </button>
                      </div>

                      {!isCreatingNewPatient ? (
                        <>
                          <select
                            value={recordingTargetPatientId}
                            onChange={(e) => setRecordingTargetPatientId(e.target.value)}
                            disabled={isClinicianRecording}
                            className="w-full px-3 py-2 bg-white text-xs border border-slate-200 rounded-xl outline-none focus:ring-1 focus:ring-[#4A90E2] cursor-pointer"
                          >
                            <option value="">-- Select Target Patient File --</option>
                            {triageHistory.map(h => (
                              <option key={h.id} value={h.id}>
                                {h.clinician_summary.primary_stressor} ({new Date(h.timestamp).toLocaleDateString()} - Risk: {h.clinician_summary.risk_level})
                              </option>
                            ))}
                          </select>
                          <p className="text-[10px] text-slate-400 mt-2 italic">
                            Logs will append directly into this patient's Clinician Notes.
                          </p>
                        </>
                      ) : (
                        <div className="space-y-3 p-3 bg-white border border-slate-200/80 rounded-xl shadow-3xs">
                          <div>
                            <label className="text-[9px] font-bold text-slate-500 block mb-1">Patient Name / Identifier</label>
                            <input
                              type="text"
                              value={newPatientName}
                              onChange={(e) => setNewPatientName(e.target.value)}
                              placeholder="e.g., Jane Doe"
                              className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none focus:bg-white focus:ring-1 focus:ring-[#4A90E2]"
                            />
                          </div>

                          <div>
                            <label className="text-[9px] font-bold text-slate-500 block mb-1">Primary Stressor / Concern</label>
                            <input
                              type="text"
                              value={newPatientStressor}
                              onChange={(e) => setNewPatientStressor(e.target.value)}
                              placeholder="e.g., Workplace Burnout"
                              className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none focus:bg-white focus:ring-1 focus:ring-[#4A90E2]"
                            />
                          </div>

                          <div>
                            <label className="text-[9px] font-bold text-slate-500 block mb-1">Triage Risk Level</label>
                            <div className="flex gap-1.5">
                              {(['Low', 'Medium', 'High'] as const).map((r) => (
                                <button
                                  key={r}
                                  type="button"
                                  onClick={() => setNewPatientRisk(r)}
                                  className={`flex-1 py-1 text-[9px] font-bold rounded-md border transition-all cursor-pointer ${
                                    newPatientRisk === r
                                      ? r === 'High'
                                        ? 'bg-red-50 border-red-200 text-red-600 font-extrabold'
                                        : r === 'Medium'
                                          ? 'bg-orange-50 border-orange-200 text-orange-600 font-extrabold'
                                          : 'bg-green-50 border-green-200 text-green-600 font-extrabold'
                                      : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
                                  }`}
                                >
                                  {r}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="mt-6 space-y-3">
                      {!isClinicianRecording ? (
                        <button
                          id="btn-clinician-record-start"
                          onClick={startClinicianRecording}
                          className="w-full py-3 bg-[#4A90E2] text-white hover:bg-blue-600 rounded-xl font-semibold text-xs tracking-wider uppercase transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-xs"
                        >
                          <Mic className="w-4 h-4" />
                          Start Session Capture
                        </button>
                      ) : (
                        <button
                          id="btn-clinician-record-stop"
                          onClick={stopClinicianRecording}
                          className="w-full py-3 bg-red-600 text-white hover:bg-red-700 rounded-xl font-semibold text-xs tracking-wider uppercase transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-sm animate-pulse"
                        >
                          <Square className="w-4 h-4" />
                          End & Save Session
                        </button>
                      )}

                      {clinicianAudioUrl && (
                        <div className="mt-4 pt-4 border-t border-slate-200 w-full">
                          <label className="text-[10px] text-[#A0A0A0] uppercase font-bold tracking-widest font-mono block mb-2">Session Audio Playback</label>
                          <audio src={clinicianAudioUrl} controls className="w-full max-h-10 mt-1" />
                          
                          <button
                            onClick={saveManualSessionNotes}
                            className="w-full mt-3 py-2 bg-[#1A1A1A] text-white hover:bg-slate-800 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-colors cursor-pointer"
                          >
                            {isCreatingNewPatient ? "Create Patient & Save Notes" : "Save notes to patient file"}
                          </button>
                        </div>
                      )}


                      {notesSaveStatus && (
                        <p className="text-[10px] font-semibold text-green-600 text-center animate-bounce mt-2 bg-green-50 p-2 border border-green-200 rounded-lg">
                          {notesSaveStatus}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Right Column: Live Session Transcription Output (spanning 2 columns) */}
                  <div className="lg:col-span-2 flex flex-col">
                    <label className="text-[10px] text-[#A0A0A0] uppercase font-bold tracking-widest font-mono block mb-2">Real-Time Interaction Transcript</label>
                    <div className="flex-1 min-h-48 p-4 bg-[#F8F9FA] border border-slate-200/50 rounded-2xl text-xs font-serif leading-relaxed text-slate-700 overflow-y-auto max-h-60 select-all whitespace-pre-wrap italic">
                      {clinicianTranscript || (
                        <span className="text-slate-400 font-sans not-italic">
                          {isClinicianRecording 
                            ? "Listening to interaction... Speak into your microphone." 
                            : "Interaction transcript will appear here in real-time once you start recording."
                          }
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>


              {/* Header Title section */}
              <div className="flex justify-between items-end mb-4 pt-2">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[#A0A0A0] font-bold mb-1">Provider Dashboard</p>
                  <h2 className="text-3xl font-serif text-[#1A1A1A] tracking-tight">Recent Triage Cases</h2>
                </div>
                {analytics.highRisk > 0 && (
                  <div className="px-4 py-1.5 bg-red-100 text-red-700 text-[10px] font-bold rounded-lg border border-red-200 uppercase tracking-widest animate-pulse font-mono">
                    {analytics.highRisk} Critical Alerts
                  </div>
                )}
              </div>

              {/* 3. Patients Card Queue Grid */}
              <div id="patient-cards-queue" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <AnimatePresence>
                  {filteredTriage.length > 0 ? (
                    filteredTriage.map((assessment) => {
                      const summary = assessment.clinician_summary;
                      const isCrisis = assessment.crisis_trigger;
                      const isHigh = summary.risk_level.toLowerCase() === 'high';
                      const isMedium = summary.risk_level.toLowerCase() === 'medium';
                      
                      let riskColorClass = 'text-green-600';
                      let riskBadgeBg = 'bg-green-50 border-green-100 text-green-700';
                      if (isHigh || isCrisis) {
                        riskColorClass = 'text-red-600';
                        riskBadgeBg = 'bg-red-50 border-red-100 text-red-700';
                      } else if (isMedium) {
                        riskColorClass = 'text-orange-500';
                        riskBadgeBg = 'bg-orange-50 border-orange-100 text-orange-700';
                      }

                      return (
                        <motion.div
                          key={assessment.id}
                          layout
                          id={`card-${assessment.id}`}
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className={`bg-white rounded-2xl border flex flex-col overflow-hidden transition-all duration-300 ${
                            isCrisis 
                              ? assessment.acknowledged 
                                ? 'border-[#E5E5E5] bg-[#F8F9FA]/60 opacity-90' 
                                : 'border-red-300 shadow-lg shadow-red-50/85'
                              : 'border-[#E5E5E5] hover:shadow-md'
                          }`}
                        >
                          {/* If crisis, show top red escalation bar */}
                          {isCrisis ? (
                            <div className="bg-red-600 px-4 py-2.5 flex justify-between items-center text-white text-[10px] font-bold uppercase tracking-widest">
                              <span>Requires Immediate Escalation</span>
                              <span className="font-mono text-red-100 tracking-normal text-[9px]">ID: {assessment.id.slice(0, 10)}</span>
                            </div>
                          ) : (
                            <div className="bg-slate-50 px-4 py-2 flex justify-between items-center border-b border-[#E5E5E5] text-[10px] text-[#A0A0A0] uppercase font-bold tracking-widest">
                              <span>Standard Diagnostic</span>
                              <span className="font-mono tracking-normal font-medium">ID: {assessment.id.slice(0, 10)}</span>
                            </div>
                          )}

                          <div className="p-6 flex-1 space-y-4">
                            {/* Case Triage Metadata */}
                            <div className="flex justify-between items-start">
                              <div className="space-y-1">
                                <p className="text-[10px] text-[#A0A0A0] uppercase font-bold tracking-widest">Case Reference</p>
                                <p className="font-serif text-lg text-[#1A1A1A]">{assessment.id.replace('sample-', 'Triage #0')}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-[10px] text-[#A0A0A0] uppercase font-bold tracking-widest">Risk Level</p>
                                <p className={`font-serif font-bold text-sm uppercase ${riskColorClass}`}>
                                  {summary.risk_level}
                                </p>
                              </div>
                            </div>

                            <div className="h-px bg-[#F0F0F0]" />

                            {/* Distress Severity Index Rating */}
                            <div className="bg-[#F8F9FA] p-3.5 rounded-xl border border-slate-200/50">
                              <div className="flex justify-between items-center mb-1.5">
                                <span className="text-[10px] text-[#888] uppercase font-bold tracking-widest font-mono">Confidential Clinical Score</span>
                                <span className="text-xs font-mono font-bold text-slate-800">{summary.clinical_score ?? 50}/100</span>
                              </div>
                              <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                                <div 
                                  className={`h-full rounded-full transition-all duration-500 ${
                                    (summary.clinical_score ?? 50) >= 80 
                                      ? 'bg-red-500' 
                                      : (summary.clinical_score ?? 50) >= 40 
                                        ? 'bg-amber-400' 
                                        : 'bg-emerald-500'
                                  }`}
                                  style={{ width: `${Math.min(100, Math.max(0, summary.clinical_score ?? 50))}%` }}
                                />
                              </div>
                              <p className="text-[9px] text-[#999] mt-1 font-sans">
                                Classified via Gemma 4 internal clinical triage reasoning weights. Invisible to patient.
                              </p>
                            </div>

                            {/* Primary Stressor */}
                            <div>
                              <p className="text-[10px] text-[#A0A0A0] uppercase font-bold tracking-widest mb-1.5">Primary Stressor</p>
                              <span className={`px-2.5 py-1 text-xs font-semibold rounded-lg border ${riskBadgeBg} font-serif lowercase italic`}>
                                #{summary.primary_stressor}
                              </span>
                            </div>

                            {/* Clinical Notes Section */}
                            <div>
                              <p className="text-[10px] text-[#A0A0A0] uppercase font-bold tracking-widest mb-1">Clinical Notes</p>
                              <p className="text-xs text-[#444] leading-relaxed italic font-serif">
                                {summary.clinical_notes}
                              </p>
                            </div>

                            {/* Transcript Content */}
                            <div>
                              <p className="text-[10px] text-[#A0A0A0] uppercase font-bold tracking-widest mb-1">Verbatim Transcript</p>
                              <p className="text-[11px] font-mono text-[#666] bg-[#F8F9FA] p-3.5 rounded-xl border border-[#EEE] leading-relaxed">
                                "{summary.transcript}"
                              </p>
                            </div>

                            {/* English Translation (if multilingual) */}
                            {summary.translated_transcript && summary.translated_transcript !== summary.transcript && (
                              <div className="mt-3">
                                <p className="text-[10px] text-[#4A90E2] uppercase font-bold tracking-widest mb-1">English Translation</p>
                                <p className="text-[11px] font-mono text-[#334E68] bg-[#F0F7FF] p-3.5 rounded-xl border border-[#D0E3F7] leading-relaxed italic">
                                  "{summary.translated_transcript}"
                                </p>
                              </div>
                            )}


                            {/* Actions / Dispatch trigger panel */}
                            <div className="pt-2 flex items-center justify-between border-t border-[#F0F0F0]">
                              <div className="text-[10px] text-[#A0A0A0] font-mono uppercase font-semibold flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5" />
                                {new Date(assessment.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </div>

                              {isCrisis && !assessment.acknowledged && (
                                <button
                                  id={`btn-ack-${assessment.id}`}
                                  onClick={() => handleAcknowledge(assessment.id)}
                                  className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-[10px] font-bold rounded-lg tracking-wider uppercase transition-colors cursor-pointer shadow-xs"
                                >
                                  Acknowledge
                                </button>
                              )}

                              {isCrisis && assessment.acknowledged && (
                                <span className="text-green-600 font-bold tracking-widest text-[10px] uppercase flex items-center gap-1">
                                  <CheckCircle className="w-3.5 h-3.5" /> Handled
                                </span>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      );
                    })
                  ) : (
                    <div className="col-span-full bg-white border border-[#E5E5E5] p-12 text-center rounded-2xl">
                      <p className="text-sm text-[#A0A0A0] italic font-serif font-medium">No triage records found matching the current filters.</p>
                    </div>
                  )}
                </AnimatePresence>
              </div>

            </motion.div>
          )}
        </AnimatePresence>

      </main>

      {/* 3. Crisis Modal Display overlay (Your safety is our priority) */}
      <AnimatePresence>
        {showCrisisModal && (
          <motion.div
            id="crisis-dialog"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#1A1A1A]/95 p-4 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              className="bg-white border border-[#E5E5E5] max-w-lg w-full rounded-2xl overflow-hidden shadow-2xl relative"
            >
              <div className="p-8 text-center text-[#1A1A1A]">
                
                {/* Warning sign */}
                <div className="inline-flex p-4 bg-red-50 text-red-600 border border-red-200 rounded-full mb-5">
                  <ShieldAlert className="w-8 h-8" />
                </div>
                
                {/* Lock dialog title */}
                <h3 className="font-display text-3xl font-medium tracking-tight text-[#1A1A1A]">
                  Your safety is our priority.
                </h3>
                
                <p className="text-[#666] text-[14px] mt-3 leading-relaxed max-w-sm mx-auto font-serif italic">
                  Our triage evaluation detected critical stressors. Please connect with immediate professional counselors or emergency facilities now.
                </p>

                {/* Patient recorded prompt block */}
                {crisisAssessment && (
                  <div className="my-6 p-4 bg-[#F8F9FA] border border-[#E5E5E5] rounded-xl text-left">
                    <span className="text-[9px] font-bold font-mono text-red-600 block tracking-wider uppercase mb-1">Detected Strain Index</span>
                    <p className="text-xs text-[#333] italic font-serif leading-relaxed">
                      "{crisisAssessment.clinician_summary.transcript}"
                    </p>
                  </div>
                )}

                {/* Massive Red Hotlinks */}
                <div className="space-y-3 mt-6">
                  <a
                    id="link-telemanas"
                    href="tel:14416"
                    className="w-full h-14 bg-red-600 hover:bg-red-700 text-white font-semibold text-sm uppercase tracking-wider flex items-center justify-center gap-3 rounded-xl shadow-lg shadow-red-200 transition-all"
                  >
                    <PhoneCall className="w-4 h-4" />
                    Call Tele MANAS (14416)
                  </a>
                  
                  <a
                    id="link-emergency"
                    href="tel:112"
                    className="w-full h-14 bg-[#1A1A1A] hover:bg-slate-800 text-white font-semibold text-sm uppercase tracking-wider flex items-center justify-center gap-3 rounded-xl shadow-lg shadow-slate-200 transition-all"
                  >
                    <PhoneCall className="w-4 h-4" />
                    Call National Services (112)
                  </a>
                </div>

                <div className="mt-8 pt-5 border-t border-[#E5E5E5] flex items-center justify-between text-[11px] text-[#888]">
                  <span className="font-mono">COGNITIVE INDEX: ALERT</span>
                  
                  {/* Exit bypass strictly for debug/testing/demonstration triage flows */}
                  <button
                    id="btn-close-crisis-modal"
                    onClick={() => {
                      setShowCrisisModal(false);
                      setCrisisAssessment(null);
                    }}
                    className="text-red-600 hover:text-red-700 font-bold uppercase tracking-wider text-[10px] underline decoration-dotted transition-colors bg-transparent outline-none cursor-pointer"
                  >
                    Dismiss Alert
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer System Credits */}
      <footer className="mt-auto bg-white border-t border-[#E5E5E5] py-6 text-center text-xs text-[#888] font-mono">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>&copy; {new Date().getFullYear()} SwaraSaathi AI Core. All records encrypted.</span>
          <div className="flex gap-4">
            <a href="https://github.com/google-gemini/google-genai" target="_blank" rel="noopener noreferrer" className="hover:text-[#1A1A1A] flex items-center gap-1">
              Google GenAI <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </footer>

    </div>
  );
}
