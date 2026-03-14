import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, X, ChevronRight, Filter } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { trackSearch } from './diagnosticSearchAnalytics';

interface DiagnosticSuggestion {
  label: string;
  icd10?: string;
  category?: string;
}

interface DiagnosticSearchInputProps {
  value: string;
  onChange: (value: string, icd10?: string) => void;
  onSelect?: (diagnosis: string, icd10?: string) => void;
  placeholder?: string;
  recentSearches?: DiagnosticSuggestion[];
  quickPicks?: DiagnosticSuggestion[];
  forceClose?: boolean;
}

// ICD-10 code validation regex
// Format: Letter + 2 digits + optional (. + 1-2 alphanumeric)
// Examples: B54, A01.0, E11.9, J45.909
const ICD10_REGEX = /^[A-Z]\d{2}(\.\d{1,2})?$/;

const validateICD10 = (code: string): boolean => {
  return ICD10_REGEX.test(code.trim().toUpperCase());
};

// Extract unique specialties from diagnoses
const SPECIALTIES = [
  'All',
  'Infectious',
  'Gastrointestinal',
  'Cardiovascular',
  'Respiratory',
  'Endocrine',
  'Neurological',
  'Musculoskeletal',
  'Dermatological',
  'Psychiatric',
  'Genitourinary',
  'Hematological',
  'Ophthalmological',
  'Oncological',
] as const;

type Specialty = typeof SPECIALTIES[number];

const COMMON_DIAGNOSES: DiagnosticSuggestion[] = [
  // Infectious Diseases
  { label: 'Uncomplicated Malaria', icd10: 'B54', category: 'Infectious' },
  { label: 'Typhoid Fever', icd10: 'A01.0', category: 'Infectious' },
  { label: 'Dengue Fever', icd10: 'A90', category: 'Infectious' },
  { label: 'Tuberculosis', icd10: 'A15.9', category: 'Infectious' },
  { label: 'HIV Disease', icd10: 'B20', category: 'Infectious' },
  { label: 'Pneumonia', icd10: 'J18.9', category: 'Infectious' },
  { label: 'Acute Upper Respiratory Infection', icd10: 'J06.9', category: 'Respiratory' },
  { label: 'Urinary Tract Infection', icd10: 'N39.0', category: 'Genitourinary' },
  { label: 'Cellulitis', icd10: 'L03.90', category: 'Infectious' },
  { label: 'Sepsis', icd10: 'A41.9', category: 'Infectious' },

  // Gastrointestinal
  { label: 'Peptic Ulcer Disease', icd10: 'K27.9', category: 'Gastrointestinal' },
  { label: 'Acute Gastroenteritis', icd10: 'K52.9', category: 'Gastrointestinal' },
  { label: 'Gastroesophageal Reflux Disease', icd10: 'K21.9', category: 'Gastrointestinal' },
  { label: 'Irritable Bowel Syndrome', icd10: 'K58.9', category: 'Gastrointestinal' },
  { label: 'Acute Appendicitis', icd10: 'K35.80', category: 'Gastrointestinal' },
  { label: 'Chronic Liver Disease', icd10: 'K76.9', category: 'Gastrointestinal' },

  // Cardiovascular
  { label: 'Hypertension', icd10: 'I10', category: 'Cardiovascular' },
  { label: 'Heart Failure', icd10: 'I50.9', category: 'Cardiovascular' },
  { label: 'Atrial Fibrillation', icd10: 'I48.91', category: 'Cardiovascular' },
  { label: 'Acute Myocardial Infarction', icd10: 'I21.9', category: 'Cardiovascular' },
  { label: 'Angina Pectoris', icd10: 'I20.9', category: 'Cardiovascular' },

  // Endocrine
  { label: 'Type 2 Diabetes Mellitus', icd10: 'E11.9', category: 'Endocrine' },
  { label: 'Type 1 Diabetes Mellitus', icd10: 'E10.9', category: 'Endocrine' },
  { label: 'Hypothyroidism', icd10: 'E03.9', category: 'Endocrine' },
  { label: 'Hyperthyroidism', icd10: 'E05.90', category: 'Endocrine' },
  { label: 'Obesity', icd10: 'E66.9', category: 'Endocrine' },

  // Respiratory
  { label: 'Asthma', icd10: 'J45.909', category: 'Respiratory' },
  { label: 'Chronic Obstructive Pulmonary Disease', icd10: 'J44.9', category: 'Respiratory' },
  { label: 'Acute Bronchitis', icd10: 'J20.9', category: 'Respiratory' },
  { label: 'Pulmonary Tuberculosis', icd10: 'A15.0', category: 'Respiratory' },

  // Neurological
  { label: 'Migraine', icd10: 'G43.9', category: 'Neurological' },
  { label: 'Acute Ischemic Stroke', icd10: 'I63.9', category: 'Neurological' },
  { label: 'Epilepsy', icd10: 'G40.909', category: 'Neurological' },
  { label: 'Tension-Type Headache', icd10: 'G44.209', category: 'Neurological' },
  { label: 'Peripheral Neuropathy', icd10: 'G62.9', category: 'Neurological' },
  { label: 'Meningitis', icd10: 'G03.9', category: 'Neurological' },

  // Dermatological
  { label: 'Lichen Simplex Chronicus', icd10: 'L28.0', category: 'Dermatological' },
  { label: 'Atopic Dermatitis', icd10: 'L20.9', category: 'Dermatological' },
  { label: 'Psoriasis', icd10: 'L40.9', category: 'Dermatological' },
  { label: 'Fungal Skin Infection', icd10: 'B36.9', category: 'Dermatological' },
  { label: 'Acne Vulgaris', icd10: 'L70.0', category: 'Dermatological' },

  // Musculoskeletal
  { label: 'Osteoarthritis', icd10: 'M19.90', category: 'Musculoskeletal' },
  { label: 'Rheumatoid Arthritis', icd10: 'M06.9', category: 'Musculoskeletal' },
  { label: 'Low Back Pain', icd10: 'M54.5', category: 'Musculoskeletal' },
  { label: 'Gout', icd10: 'M10.9', category: 'Musculoskeletal' },

  // Psychiatric
  { label: 'Major Depressive Disorder', icd10: 'F32.9', category: 'Psychiatric' },
  { label: 'Generalized Anxiety Disorder', icd10: 'F41.1', category: 'Psychiatric' },
  { label: 'Bipolar Disorder', icd10: 'F31.9', category: 'Psychiatric' },
  { label: 'Schizophrenia', icd10: 'F20.9', category: 'Psychiatric' },
  { label: 'Panic Disorder', icd10: 'F41.0', category: 'Psychiatric' },
  { label: 'Post-Traumatic Stress Disorder', icd10: 'F43.10', category: 'Psychiatric' },
  { label: 'Obsessive-Compulsive Disorder', icd10: 'F42.9', category: 'Psychiatric' },
  { label: 'Insomnia', icd10: 'G47.00', category: 'Psychiatric' },
  { label: 'Alcohol Use Disorder', icd10: 'F10.20', category: 'Psychiatric' },
  { label: 'Substance Use Disorder', icd10: 'F19.20', category: 'Psychiatric' },

  // More Infectious Diseases
  { label: 'Acute Tonsillitis', icd10: 'J03.90', category: 'Infectious' },
  { label: 'Acute Sinusitis', icd10: 'J01.90', category: 'Infectious' },
  { label: 'Acute Otitis Media', icd10: 'H66.90', category: 'Infectious' },
  { label: 'Conjunctivitis', icd10: 'H10.9', category: 'Infectious' },
  { label: 'Skin Abscess', icd10: 'L02.91', category: 'Infectious' },
  { label: 'Herpes Zoster (Shingles)', icd10: 'B02.9', category: 'Infectious' },
  { label: 'Herpes Simplex', icd10: 'B00.9', category: 'Infectious' },
  { label: 'Chickenpox', icd10: 'B01.9', category: 'Infectious' },
  { label: 'Measles', icd10: 'B05.9', category: 'Infectious' },
  { label: 'Mumps', icd10: 'B26.9', category: 'Infectious' },
  { label: 'Hepatitis A', icd10: 'B15.9', category: 'Infectious' },
  { label: 'Hepatitis B', icd10: 'B16.9', category: 'Infectious' },
  { label: 'Hepatitis C', icd10: 'B17.10', category: 'Infectious' },
  { label: 'Influenza', icd10: 'J11.1', category: 'Infectious' },
  { label: 'COVID-19', icd10: 'U07.1', category: 'Infectious' },
  { label: 'Scabies', icd10: 'B86', category: 'Infectious' },
  { label: 'Lice Infestation', icd10: 'B85.2', category: 'Infectious' },
  { label: 'Candidiasis', icd10: 'B37.9', category: 'Infectious' },
  { label: 'Bacterial Vaginosis', icd10: 'N76.0', category: 'Genitourinary' },
  { label: 'Pelvic Inflammatory Disease', icd10: 'N73.9', category: 'Genitourinary' },

  // More Gastrointestinal
  { label: 'Constipation', icd10: 'K59.00', category: 'Gastrointestinal' },
  { label: 'Diarrhea', icd10: 'K59.1', category: 'Gastrointestinal' },
  { label: 'Hemorrhoids', icd10: 'K64.9', category: 'Gastrointestinal' },
  { label: 'Anal Fissure', icd10: 'K60.2', category: 'Gastrointestinal' },
  { label: 'Cholecystitis', icd10: 'K81.9', category: 'Gastrointestinal' },
  { label: 'Cholelithiasis', icd10: 'K80.20', category: 'Gastrointestinal' },
  { label: 'Pancreatitis', icd10: 'K85.90', category: 'Gastrointestinal' },
  { label: 'Diverticulitis', icd10: 'K57.92', category: 'Gastrointestinal' },
  { label: 'Gastritis', icd10: 'K29.70', category: 'Gastrointestinal' },
  { label: 'Dyspepsia', icd10: 'K30', category: 'Gastrointestinal' },
  { label: 'Helicobacter Pylori Infection', icd10: 'B96.81', category: 'Gastrointestinal' },

  // More Cardiovascular
  { label: 'Deep Vein Thrombosis', icd10: 'I82.40', category: 'Cardiovascular' },
  { label: 'Pulmonary Embolism', icd10: 'I26.99', category: 'Cardiovascular' },
  { label: 'Peripheral Artery Disease', icd10: 'I73.9', category: 'Cardiovascular' },
  { label: 'Cardiomyopathy', icd10: 'I42.9', category: 'Cardiovascular' },
  { label: 'Valvular Heart Disease', icd10: 'I38', category: 'Cardiovascular' },
  { label: 'Pericarditis', icd10: 'I30.9', category: 'Cardiovascular' },
  { label: 'Endocarditis', icd10: 'I33.0', category: 'Cardiovascular' },

  // More Respiratory
  { label: 'Pleural Effusion', icd10: 'J90', category: 'Respiratory' },
  { label: 'Pneumothorax', icd10: 'J93.9', category: 'Respiratory' },
  { label: 'Bronchiectasis', icd10: 'J47.9', category: 'Respiratory' },
  { label: 'Interstitial Lung Disease', icd10: 'J84.9', category: 'Respiratory' },
  { label: 'Sleep Apnea', icd10: 'G47.33', category: 'Respiratory' },
  { label: 'Allergic Rhinitis', icd10: 'J30.9', category: 'Respiratory' },

  // More Endocrine
  { label: 'Diabetic Ketoacidosis', icd10: 'E10.10', category: 'Endocrine' },
  { label: 'Hyperosmolar Hyperglycemic State', icd10: 'E11.00', category: 'Endocrine' },
  { label: 'Hypoglycemia', icd10: 'E16.2', category: 'Endocrine' },
  { label: 'Thyroid Nodule', icd10: 'E04.1', category: 'Endocrine' },
  { label: 'Goiter', icd10: 'E04.9', category: 'Endocrine' },
  { label: 'Adrenal Insufficiency', icd10: 'E27.40', category: 'Endocrine' },
  { label: 'Cushings Syndrome', icd10: 'E24.9', category: 'Endocrine' },
  { label: 'Polycystic Ovary Syndrome', icd10: 'E28.2', category: 'Endocrine' },

  // More Neurological
  { label: 'Transient Ischemic Attack', icd10: 'G45.9', category: 'Neurological' },
  { label: 'Hemorrhagic Stroke', icd10: 'I61.9', category: 'Neurological' },
  { label: 'Parkinsons Disease', icd10: 'G20', category: 'Neurological' },
  { label: 'Multiple Sclerosis', icd10: 'G35', category: 'Neurological' },
  { label: 'Alzheimers Disease', icd10: 'G30.9', category: 'Neurological' },
  { label: 'Dementia', icd10: 'F03.90', category: 'Neurological' },
  { label: 'Bell\'s Palsy', icd10: 'G51.0', category: 'Neurological' },
  { label: 'Trigeminal Neuralgia', icd10: 'G50.0', category: 'Neurological' },
  { label: 'Vertigo', icd10: 'R42', category: 'Neurological' },
  { label: 'Benign Paroxysmal Positional Vertigo', icd10: 'H81.10', category: 'Neurological' },

  // More Musculoskeletal
  { label: 'Neck Pain', icd10: 'M54.2', category: 'Musculoskeletal' },
  { label: 'Shoulder Pain', icd10: 'M25.519', category: 'Musculoskeletal' },
  { label: 'Rotator Cuff Syndrome', icd10: 'M75.10', category: 'Musculoskeletal' },
  { label: 'Tennis Elbow', icd10: 'M77.10', category: 'Musculoskeletal' },
  { label: 'Carpal Tunnel Syndrome', icd10: 'G56.00', category: 'Musculoskeletal' },
  { label: 'Knee Pain', icd10: 'M25.569', category: 'Musculoskeletal' },
  { label: 'Meniscal Tear', icd10: 'M23.209', category: 'Musculoskeletal' },
  { label: 'Plantar Fasciitis', icd10: 'M72.2', category: 'Musculoskeletal' },
  { label: 'Fibromyalgia', icd10: 'M79.7', category: 'Musculoskeletal' },
  { label: 'Osteoporosis', icd10: 'M81.0', category: 'Musculoskeletal' },
  { label: 'Fracture', icd10: 'T14.90', category: 'Musculoskeletal' },
  { label: 'Sprain', icd10: 'T14.3', category: 'Musculoskeletal' },

  // More Dermatological
  { label: 'Urticaria (Hives)', icd10: 'L50.9', category: 'Dermatological' },
  { label: 'Contact Dermatitis', icd10: 'L25.9', category: 'Dermatological' },
  { label: 'Seborrheic Dermatitis', icd10: 'L21.9', category: 'Dermatological' },
  { label: 'Rosacea', icd10: 'L71.9', category: 'Dermatological' },
  { label: 'Vitiligo', icd10: 'L80', category: 'Dermatological' },
  { label: 'Warts', icd10: 'B07.9', category: 'Dermatological' },
  { label: 'Molluscum Contagiosum', icd10: 'B08.1', category: 'Dermatological' },
  { label: 'Impetigo', icd10: 'L01.00', category: 'Dermatological' },

  // Genitourinary
  { label: 'Chronic Kidney Disease', icd10: 'N18.9', category: 'Genitourinary' },
  { label: 'Acute Kidney Injury', icd10: 'N17.9', category: 'Genitourinary' },
  { label: 'Kidney Stones', icd10: 'N20.0', category: 'Genitourinary' },
  { label: 'Benign Prostatic Hyperplasia', icd10: 'N40.0', category: 'Genitourinary' },
  { label: 'Prostatitis', icd10: 'N41.9', category: 'Genitourinary' },
  { label: 'Erectile Dysfunction', icd10: 'N52.9', category: 'Genitourinary' },
  { label: 'Menstrual Irregularities', icd10: 'N92.6', category: 'Genitourinary' },
  { label: 'Dysmenorrhea', icd10: 'N94.6', category: 'Genitourinary' },
  { label: 'Endometriosis', icd10: 'N80.9', category: 'Genitourinary' },
  { label: 'Ovarian Cyst', icd10: 'N83.20', category: 'Genitourinary' },

  // Hematological
  { label: 'Iron Deficiency Anemia', icd10: 'D50.9', category: 'Hematological' },
  { label: 'Vitamin B12 Deficiency Anemia', icd10: 'D51.9', category: 'Hematological' },
  { label: 'Folate Deficiency Anemia', icd10: 'D52.9', category: 'Hematological' },
  { label: 'Sickle Cell Disease', icd10: 'D57.1', category: 'Hematological' },
  { label: 'Thalassemia', icd10: 'D56.9', category: 'Hematological' },
  { label: 'Thrombocytopenia', icd10: 'D69.6', category: 'Hematological' },

  // Ophthalmological
  { label: 'Cataract', icd10: 'H26.9', category: 'Ophthalmological' },
  { label: 'Glaucoma', icd10: 'H40.9', category: 'Ophthalmological' },
  { label: 'Diabetic Retinopathy', icd10: 'E11.319', category: 'Ophthalmological' },
  { label: 'Macular Degeneration', icd10: 'H35.30', category: 'Ophthalmological' },
  { label: 'Dry Eye Syndrome', icd10: 'H04.129', category: 'Ophthalmological' },

  // Oncological
  { label: 'Breast Cancer', icd10: 'C50.919', category: 'Oncological' },
  { label: 'Lung Cancer', icd10: 'C34.90', category: 'Oncological' },
  { label: 'Colorectal Cancer', icd10: 'C18.9', category: 'Oncological' },
  { label: 'Prostate Cancer', icd10: 'C61', category: 'Oncological' },
  { label: 'Cervical Cancer', icd10: 'C53.9', category: 'Oncological' },
];

export const DiagnosticSearchInput: React.FC<DiagnosticSearchInputProps> = ({
  value,
  onChange,
  onSelect,
  placeholder = 'Search diagnosis or ICD-10 code',
  recentSearches = [],
  quickPicks = [],
  forceClose = false,
}) => {
  const [focused, setFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<DiagnosticSuggestion[]>([]);
  const [selectedSpecialty, setSelectedSpecialty] = useState<Specialty>('All');
  const [showFilters, setShowFilters] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Force close dropdown when parent requests it
  useEffect(() => {
    if (forceClose) {
      setFocused(false);
      setShowFilters(false);
    }
  }, [forceClose]);

  // Filter diagnoses by specialty
  const filteredDiagnoses = useMemo(() => {
    if (selectedSpecialty === 'All') return COMMON_DIAGNOSES;
    return COMMON_DIAGNOSES.filter((d) => d.category === selectedSpecialty);
  }, [selectedSpecialty]);

  // Filter suggestions based on input
  useEffect(() => {
    const query = value.trim().toLowerCase();

    if (!query || query.length < 2) {
      setSuggestions([]);
      return;
    }

    // Search in filtered diagnoses (respects specialty filter)
    const matches = filteredDiagnoses.filter(
      (item) =>
        item.label.toLowerCase().includes(query) ||
        item.icd10?.toLowerCase().includes(query) ||
        item.category?.toLowerCase().includes(query)
    ).slice(0, 8);

    setSuggestions(matches);
  }, [value, filteredDiagnoses]);

  const handleSelect = (diagnosis: string, icd10?: string, category?: string, source: 'search' | 'quick_pick' | 'recent' = 'search') => {
    // Track analytics
    trackSearch(diagnosis, icd10, category, source);

    onChange(diagnosis, icd10);
    onSelect?.(diagnosis, icd10);
    setFocused(false);
    inputRef.current?.blur();
  };

  const handleClear = () => {
    onChange('');
    inputRef.current?.focus();
  };

  const showSuggestions = focused && (suggestions.length > 0 || recentSearches.length > 0);
  const showQuickPicks = !value.trim() && quickPicks.length > 0;

  return (
    <div ref={containerRef} className="relative w-full z-[200]">
      {/* Search Input */}
      <div
        className={`h-12 rounded-2xl surface-strong px-4 inline-flex items-center gap-3 w-full transition-all ${
          focused ? 'ring-2 ring-accent-primary/30' : ''
        }`}
      >
        <Search size={16} className="text-content-dim shrink-0" />
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 200)}
          placeholder={placeholder}
          className="flex-1 text-sm text-content-primary bg-transparent outline-none"
        />
        {value && (
          <button
            onClick={handleClear}
            className="shrink-0 p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            <X size={14} className="text-content-dim" />
          </button>
        )}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`shrink-0 p-1.5 rounded-full transition-colors ${
            showFilters || selectedSpecialty !== 'All'
              ? 'bg-accent-primary/20 text-accent-primary'
              : 'hover:bg-black/5 dark:hover:bg-white/5 text-content-dim'
          }`}
          title="Filter by specialty"
        >
          <Filter size={14} />
        </button>
      </div>

      {/* Specialty Filters */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="mt-2 overflow-hidden"
          >
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
              {SPECIALTIES.map((specialty) => (
                <button
                  key={specialty}
                  onClick={() => setSelectedSpecialty(specialty)}
                  className={`h-8 px-3 rounded-full text-xs font-medium shrink-0 transition-all ${
                    selectedSpecialty === specialty
                      ? 'bg-accent-primary text-white'
                      : 'surface-strong text-content-secondary hover:bg-accent-primary/10'
                  }`}
                >
                  {specialty}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quick Picks (when empty) */}
      {showQuickPicks && !focused && (
        <div className="mt-3 flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          {quickPicks.map((item, index) => (
            <button
              key={`quick-${index}`}
              onClick={() => handleSelect(item.label, item.icd10, item.category, 'quick_pick')}
              className="h-9 px-3.5 rounded-full surface-strong text-xs font-medium text-content-primary interactive-tap shrink-0 hover:bg-accent-primary/10 transition-colors"
            >
              <span className="block max-w-[10.5rem] truncate whitespace-nowrap">{item.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Suggestions Dropdown */}
      <AnimatePresence>
        {showSuggestions && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-0 right-0 mt-2 surface-raised rounded-2xl p-2 shadow-xl z-[210] max-h-[320px] overflow-y-auto"
          >
            {/* Recent Searches */}
            {recentSearches.length > 0 && !value.trim() && (
              <div className="mb-2">
                <p className="text-[10px] text-content-dim uppercase tracking-wide px-3 py-2">Recent</p>
                {recentSearches.map((item, index) => (
                  <button
                    key={`recent-${index}`}
                    onClick={() => handleSelect(item.label, item.icd10, item.category, 'recent')}
                    className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-accent-primary/10 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-content-primary truncate">{item.label}</p>
                        {item.icd10 && (
                          <p className="text-[11px] text-content-dim mt-0.5">ICD-10: {item.icd10}</p>
                        )}
                      </div>
                      <ChevronRight size={14} className="text-content-dim shrink-0" />
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Suggestions */}
            {suggestions.length > 0 && (
              <div>
                <p className="text-[10px] text-content-dim uppercase tracking-wide px-3 py-2">
                  {value.trim() ? 'Suggestions' : 'Common Diagnoses'}
                </p>
                {suggestions.map((item, index) => (
                  <button
                    key={`suggestion-${index}`}
                    onClick={() => handleSelect(item.label, item.icd10, item.category, 'search')}
                    className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-accent-primary/10 transition-colors group"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-content-primary truncate">{item.label}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {item.icd10 && (
                            <span
                              className={`text-[11px] font-mono ${
                                validateICD10(item.icd10)
                                  ? 'text-accent-primary'
                                  : 'text-danger-primary'
                              }`}
                              title={
                                validateICD10(item.icd10)
                                  ? 'Valid ICD-10 code'
                                  : 'Invalid ICD-10 format'
                              }
                            >
                              {item.icd10}
                              {!validateICD10(item.icd10) && ' ⚠'}
                            </span>
                          )}
                          {item.category && (
                            <span className="text-[11px] text-content-dim">• {item.category}</span>
                          )}
                        </div>
                      </div>
                      <ChevronRight size={14} className="text-content-dim shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

