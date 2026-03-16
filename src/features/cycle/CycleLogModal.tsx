import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Droplets,
  Plus,
  AlertCircle,
  Thermometer,
  Heart,
  Brain,
  Moon,
  Activity,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { CycleFlow, CycleLog } from '../../core/types/clinical';
import { useClinical } from '../../core/context/ClinicalContext';
import { signalFeedback } from '../../core/services/feedback';

interface CycleLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  prefillData?: Partial<CycleLog>;
  isUpdate?: boolean;
}

const flowOptions: Array<{ value: CycleFlow; label: string; icon: any; color: string }> = [
  { value: 'none', label: 'No Flow', icon: Droplets, color: 'text-blue-400' },
  { value: 'spotting', label: 'Spotting', icon: Droplets, color: 'text-pink-300' },
  { value: 'light', label: 'Light', icon: Droplets, color: 'text-pink-400' },
  { value: 'medium', label: 'Medium', icon: Droplets, color: 'text-pink-500' },
  { value: 'heavy', label: 'Heavy', icon: Droplets, color: 'text-rose-500' },
];

const symptomOptions = [
  { id: 'cramps', label: 'Cramps', icon: AlertCircle },
  { id: 'headache', label: 'Headache', icon: Brain },
  { id: 'bloating', label: 'Bloating', icon: Activity },
  { id: 'breast_tenderness', label: 'Breast Tenderness', icon: Heart },
  { id: 'fatigue', label: 'Fatigue', icon: Moon },
  { id: 'nausea', label: 'Nausea', icon: Thermometer },
  { id: 'back_pain', label: 'Back Pain', icon: Activity },
  { id: 'mood_swings', label: 'Mood Swings', icon: Sparkles },
  { id: 'acne', label: 'Acne', icon: AlertCircle },
  { id: 'appetite_changes', label: 'Appetite Changes', icon: Heart },
  { id: 'sleep_changes', label: 'Sleep Changes', icon: Moon },
  { id: 'anxiety', label: 'Anxiety', icon: Brain },
];

const moodOptions = [
  { value: 'great', label: 'Great', emoji: '😊' },
  { value: 'good', label: 'Good', emoji: '🙂' },
  { value: 'neutral', label: 'Neutral', emoji: '😐' },
  { value: 'low', label: 'Low', emoji: '😔' },
  { value: 'anxious', label: 'Anxious', emoji: '😰' },
  { value: 'irritable', label: 'Irritable', emoji: '😤' },
];

export const CycleLogModal: React.FC<CycleLogModalProps> = ({ 
  isOpen, 
  onClose, 
  prefillData, 
  isUpdate = false 
}) => {
  const { state, dispatch } = useClinical();
  const { cycle, settings } = state;
  
  // Progressive disclosure states
  const [expandedSection, setExpandedSection] = useState<'basic' | 'symptoms' | 'advanced' | 'full'>('basic');
  const [selectedFlow, setSelectedFlow] = useState<CycleFlow>(prefillData?.flow || 'none');
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>(prefillData?.symptoms || []);
  const [selectedMood, setSelectedMood] = useState<string>(prefillData?.mood || '');
  const [basalTemp, setBasalTemp] = useState<string>(prefillData?.basal_temp?.toString() || '');
  const [medications, setMedications] = useState<string[]>(prefillData?.medications || []);
  const [notes, setNotes] = useState<string>(prefillData?.notes || '');
  const [medicationInput, setMedicationInput] = useState('');

  // Smart detection of today's existing log
  const todayLog = cycle.logs.find(log => {
    const logDate = new Date(log.timestamp);
    const today = new Date();
    return logDate.toDateString() === today.toDateString();
  });

  const isUpdatingToday = Boolean(todayLog && !isUpdate);
  const hasExistingData = Boolean(prefillData || todayLog);

  const feedback = (kind: Parameters<typeof signalFeedback>[0] = 'select') =>
    signalFeedback(kind, {
      hapticsEnabled: settings.haptics_enabled,
      audioEnabled: settings.audio_enabled,
    });

  const handleFlowSelect = (flow: CycleFlow) => {
    feedback('select');
    setSelectedFlow(flow);
    // Auto-expand to symptoms when flow is selected
    if (flow !== 'none' && expandedSection === 'basic') {
      setExpandedSection('symptoms');
    }
  };

  const handleSymptomToggle = (symptom: string) => {
    feedback('select');
    setSelectedSymptoms(prev => 
      prev.includes(symptom) 
        ? prev.filter(s => s !== symptom)
        : [...prev, symptom]
    );
    // Auto-expand to advanced when symptoms are selected
    if (selectedSymptoms.length === 0 && expandedSection === 'symptoms') {
      setExpandedSection('advanced');
    }
  };

  const handleMoodSelect = (mood: string) => {
    feedback('select');
    setSelectedMood(mood);
  };

  const handleAddMedication = () => {
    if (medicationInput.trim()) {
      setMedications(prev => [...prev, medicationInput.trim()]);
      setMedicationInput('');
      feedback('submit');
    }
  };

  const handleRemoveMedication = (med: string) => {
    setMedications(prev => prev.filter(m => m !== med));
    feedback('select');
  };

  const handleSave = () => {
    const logData: Omit<CycleLog, 'id'> = {
      timestamp: prefillData?.timestamp || Date.now(),
      flow: selectedFlow,
      symptoms: selectedSymptoms,
      mood: selectedMood || undefined,
      basal_temp: basalTemp ? parseFloat(basalTemp) : undefined,
      medications: medications.length > 0 ? medications : undefined,
      notes: notes.trim() || undefined,
    };

    dispatch({ 
      type: 'LOG_CYCLE_EVENT', 
      payload: logData
    });

    feedback('submit');
    onClose();
  };

  const handleUpdateToday = () => {
    if (todayLog) {
      // Pre-fill with today's data and switch to update mode
      setSelectedFlow(todayLog.flow || 'none');
      setSelectedSymptoms(todayLog.symptoms || []);
      setSelectedMood(todayLog.mood || '');
      setBasalTemp(todayLog.basal_temp?.toString() || '');
      setMedications(todayLog.medications || []);
      setNotes(todayLog.notes || '');
      setExpandedSection('full');
    }
  };

  const handleExpandSection = (section: typeof expandedSection) => {
    feedback('select');
    setExpandedSection(section);
  };

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setSelectedFlow(prefillData?.flow || 'none');
      setSelectedSymptoms(prefillData?.symptoms || []);
      setSelectedMood(prefillData?.mood || '');
      setBasalTemp(prefillData?.basal_temp?.toString() || '');
      setMedications(prefillData?.medications || []);
      setNotes(prefillData?.notes || '');
      setExpandedSection(hasExistingData ? 'full' : 'basic');
    }
  }, [isOpen, prefillData]);

  const modalVariants = {
    hidden: { opacity: 0, scale: 0.9 },
    visible: { 
      opacity: 1, 
      scale: 1,
      transition: { type: 'spring' as const, stiffness: 300, damping: 30 }
    },
    exit: { opacity: 0, scale: 0.9 }
  };

  const sectionVariants = {
    hidden: { opacity: 0, height: 0 },
    visible: { opacity: 1, height: 'auto', transition: { duration: 0.3 } },
    exit: { opacity: 0, height: 0 }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            variants={modalVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className={`w-full max-w-lg ${
              expandedSection === 'full' ? 'max-h-[90vh]' : 'max-h-[80vh]'
            } bg-surface rounded-[32px] shadow-2xl overflow-hidden flex flex-col`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center">
                  <Droplets size={20} className="text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-content-primary">
                    {isUpdate ? 'Update Log' : isUpdatingToday ? 'Update Today\'s Log?' : 'Log Cycle Data'}
                  </h2>
                  {isUpdatingToday && (
                    <p className="text-sm text-content-secondary">
                      You already logged today at {new Date(todayLog!.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-10 h-10 rounded-full surface-strong flex items-center justify-center interactive-tap"
              >
                <X size={18} />
              </button>
            </div>

            {/* Smart Update Today Banner */}
            <AnimatePresence>
              {isUpdatingToday && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="mx-6 mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-2xl"
                >
                  <div className="flex items-start gap-3">
                    <AlertCircle size={18} className="text-blue-500 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                        Today's Log Exists
                      </p>
                      <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                        Flow: {todayLog?.flow || 'none'} | 
                        Symptoms: {todayLog?.symptoms.length || 0} | 
                        Mood: {todayLog?.mood || 'not set'}
                      </p>
                      <button
                        onClick={handleUpdateToday}
                        className="mt-2 px-3 py-1 bg-blue-500 text-white text-xs font-medium rounded-full interactive-tap"
                      >
                        Update Today's Entry
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
              {/* Basic Section - Always Visible */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-content-primary">Flow</h3>
                  {expandedSection === 'basic' && (
                    <button
                      onClick={() => handleExpandSection('symptoms')}
                      className="text-xs text-content-dim interactive-tap flex items-center gap-1"
                    >
                      More <ChevronRight size={14} />
                    </button>
                  )}
                </div>
                
                <div className="grid grid-cols-5 gap-2">
                  {flowOptions.map((option) => {
                    const Icon = option.icon;
                    return (
                      <motion.button
                        key={option.value}
                        onClick={() => handleFlowSelect(option.value)}
                        whileHover={{ y: -2 }}
                        whileTap={{ scale: 0.95 }}
                        className={`relative p-3 rounded-2xl flex flex-col items-center gap-1 transition-all ${
                          selectedFlow === option.value
                            ? 'bg-gradient-to-br from-pink-400 to-rose-500 text-white shadow-lg'
                            : 'surface-strong text-content-secondary hover:text-content-primary'
                        }`}
                      >
                        {selectedFlow === option.value && (
                          <motion.div
                            layoutId="flow-selection"
                            className="absolute inset-0 rounded-2xl bg-gradient-to-br from-pink-400 to-rose-500"
                            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                          />
                        )}
                        <span className="relative z-10">
                          <Icon size={16} />
                        </span>
                        <span className="relative z-10 text-xs font-medium">{option.label}</span>
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              {/* Symptoms Section - Progressive Disclosure */}
              <AnimatePresence>
                {(expandedSection === 'symptoms' || expandedSection === 'advanced' || expandedSection === 'full') && (
                  <motion.div
                    variants={sectionVariants}
                    initial="hidden"
                    animate="visible"
                    exit="hidden"
                    className="space-y-4"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-content-primary">Symptoms</h3>
                      {expandedSection === 'symptoms' && (
                        <button
                          onClick={() => handleExpandSection('advanced')}
                          className="text-xs text-content-dim interactive-tap flex items-center gap-1"
                        >
                          More <ChevronRight size={14} />
                        </button>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-3 gap-2">
                      {symptomOptions.slice(0, expandedSection === 'symptoms' ? 6 : 12).map((symptom) => {
                        const Icon = symptom.icon;
                        const isSelected = selectedSymptoms.includes(symptom.id);
                        return (
                          <motion.button
                            key={symptom.id}
                            onClick={() => handleSymptomToggle(symptom.id)}
                            whileHover={{ y: -1 }}
                            whileTap={{ scale: 0.95 }}
                            className={`relative p-3 rounded-xl flex flex-col items-center gap-1 transition-all ${
                              isSelected
                                ? 'bg-blue-500 text-white shadow-md'
                                : 'surface-strong text-content-secondary hover:text-content-primary'
                            }`}
                          >
                            <Icon size={14} />
                            <span className="text-xs font-medium">{symptom.label}</span>
                          </motion.button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Advanced Section - Progressive Disclosure */}
              <AnimatePresence>
                {(expandedSection === 'advanced' || expandedSection === 'full') && (
                  <motion.div
                    variants={sectionVariants}
                    initial="hidden"
                    animate="visible"
                    exit="hidden"
                    className="space-y-4"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-content-primary">Advanced</h3>
                      {expandedSection === 'advanced' && (
                        <button
                          onClick={() => handleExpandSection('full')}
                          className="text-xs text-content-dim interactive-tap flex items-center gap-1"
                        >
                          More <ChevronRight size={14} />
                        </button>
                      )}
                    </div>

                    {/* Mood */}
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-content-dim">Mood</label>
                      <div className="grid grid-cols-6 gap-1">
                        {moodOptions.map((mood) => (
                          <button
                            key={mood.value}
                            onClick={() => handleMoodSelect(mood.value)}
                            className={`p-2 rounded-lg text-center transition-all ${
                              selectedMood === mood.value
                                ? 'bg-purple-500 text-white'
                                : 'surface-strong text-content-secondary hover:text-content-primary'
                            }`}
                          >
                            <div className="text-lg">{mood.emoji}</div>
                            <div className="text-xs">{mood.label}</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Basal Temperature */}
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-content-dim">Basal Temperature (°C)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={basalTemp}
                        onChange={(e) => setBasalTemp(e.target.value)}
                        placeholder="36.5"
                        className="w-full p-3 surface-strong rounded-xl text-sm"
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Full Section - Progressive Disclosure */}
              <AnimatePresence>
                {expandedSection === 'full' && (
                  <motion.div
                    variants={sectionVariants}
                    initial="hidden"
                    animate="visible"
                    exit="hidden"
                    className="space-y-4"
                  >
                    <h3 className="text-sm font-semibold text-content-primary">Additional Details</h3>

                    {/* Medications */}
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-content-dim">Medications</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={medicationInput}
                          onChange={(e) => setMedicationInput(e.target.value)}
                          placeholder="Add medication..."
                          className="flex-1 p-2 surface-strong rounded-lg text-sm"
                          onKeyPress={(e) => e.key === 'Enter' && handleAddMedication()}
                        />
                        <button
                          onClick={handleAddMedication}
                          className="p-2 bg-blue-500 text-white rounded-lg interactive-tap"
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                      {medications.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {medications.map((med, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-xs flex items-center gap-1"
                            >
                              {med}
                              <button
                                onClick={() => handleRemoveMedication(med)}
                                className="ml-1 text-blue-500 hover:text-blue-700"
                              >
                                <X size={12} />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Notes */}
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-content-dim">Notes</label>
                      <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Add any additional notes..."
                        className="w-full p-3 surface-strong rounded-xl text-sm resize-none"
                        rows={3}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Footer */}
            <div className="p-6">
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 py-3 surface-strong rounded-xl text-sm font-medium interactive-tap"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="flex-1 py-3 bg-gradient-to-r from-pink-400 to-rose-500 text-white rounded-xl text-sm font-medium shadow-lg interactive-tap"
                >
                  {isUpdate ? 'Update' : 'Save'} Log
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
