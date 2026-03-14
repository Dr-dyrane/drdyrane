# Complete User Flow Diagrams

**Date:** 2026-03-14  
**Purpose:** Visual documentation of the complete user journey through Dr. Dyrane

---

## Diagram 1: Full User Flow (Landing → Diagnosis → PDF)

```mermaid
graph TD
    Start([User Opens App]) --> Launch[Launch Spotlight Modal]
    
    Launch --> Choice{User Selects}
    Choice -->|Scan| ScanFlow[Diagnostic Scanner Flow]
    Choice -->|Consult| ConsultFlow[Consultation Flow]
    Choice -->|Drug| DrugFlow[Drug Protocols]
    Choice -->|History| HistoryFlow[Past Consultations]
    
    ConsultFlow --> Step1[StepRenderer Component]
    
    Step1 --> Transcript[Conversation Transcript<br/>Doctor + Patient Messages]
    
    Transcript --> DoctorQ[Doctor Asks Question]
    
    DoctorQ --> OptionsEngine[Options Engine<br/>Generates Suggestions]
    
    OptionsEngine --> API["/api/options"<br/>OPTIONS_SYSTEM_PROMPT]
    
    API --> Generate[AI Generates<br/>Context-Aware Options]
    
    Generate --> Display[Response Options Panel<br/>Shows Suggestions]
    
    Display --> PatientChoice{Patient Can}
    
    PatientChoice -->|Click Option| SelectOpt[Select Suggested Answer]
    PatientChoice -->|Type| CustomInput[Type Custom Answer]
    PatientChoice -->|Upload| ImageUpload[Upload Image]
    
    SelectOpt --> Send[Send to AgentCoordinator]
    CustomInput --> Send
    ImageUpload --> Send
    
    Send --> Process[AI Processes<br/>Updates SOAP + Clerking]
    
    Process --> Check{Adequate<br/>History?}
    
    Check -->|No| Block[Min 5 questions<br/>Min 3 HPC elements<br/>Phase check]
    Block --> NextQ[Generate Next Question]
    NextQ --> DoctorQ
    
    Check -->|Yes| Diagnosis[Offer Working Diagnosis]
    
    Diagnosis --> Accept{Patient<br/>Ready?}
    
    Accept -->|Add Detail| DoctorQ
    Accept -->|Yes| Complete[status = 'complete']
    
    Complete --> Pillar[PillarCard Component]
    
    Pillar --> Display2[Display Diagnosis<br/>ICD-10 Code<br/>Management Plan<br/>Investigations<br/>Prescriptions<br/>Counseling<br/>Follow-up<br/>Prognosis<br/>Prevention]
    
    Display2 --> Actions{User Actions}
    
    Actions -->|Copy| Copy[Copy Summary<br/>to Clipboard]
    Actions -->|Export| PDF[Generate PDF<br/>clinicalPdf.ts]
    Actions -->|Reset| Reset[Start New Consultation]
    
    PDF --> Download[Download Clinical Record<br/>Professional Format<br/>Suitable for Continuity of Care]
    
    Download --> End([Flow Complete])
    Copy --> End
    Reset --> Start
    
    style Start fill:#e1f5e1
    style End fill:#e1f5e1
    style OptionsEngine fill:#e1e5ff
    style API fill:#e1e5ff
    style Generate fill:#e1e5ff
    style Display fill:#fff4e1
    style Block fill:#ffe1e1
    style Pillar fill:#ffe1f5
    style PDF fill:#ffe1f5
    style Download fill:#e1f5e1
```

---

## Diagram 2: Response Options System (How Suggestions Work)

```mermaid
graph LR
    subgraph Doctor["👨‍⚕️ Doctor Question"]
        Q1["How did the fever start?"]
    end
    
    subgraph Engine["🔧 Options Engine"]
        Parse[Parse Question Intent]
        Parse --> Detect{Detect Type}
        Detect -->|Onset| OnsetOpts
        Detect -->|Character| CharOpts
        Detect -->|Severity| SevOpts
        Detect -->|Yes/No| BinaryOpts
        Detect -->|Timeline| TimeOpts
        
        OnsetOpts[Onset Pattern<br/>Recognized]
        CharOpts[Character Pattern<br/>Recognized]
        SevOpts[Severity Pattern<br/>Recognized]
        BinaryOpts[Binary Pattern<br/>Recognized]
        TimeOpts[Timeline Pattern<br/>Recognized]
        
        OnsetOpts --> Gen[Generate Options]
        CharOpts --> Gen
        SevOpts --> Gen
        BinaryOpts --> Gen
        TimeOpts --> Gen
        
        Gen --> JSON["JSON Response:<br/>{mode: 'single',<br/>ui_variant: 'segmented',<br/>options: [...],<br/>allow_custom_input: true}"]
    end
    
    subgraph Display["📱 Response Panel"]
        JSON --> Render[Render UI]
        Render --> Opts["✅ Suddenly<br/>✅ Gradually<br/>✅ Not sure"]
        Render --> Custom["💬 Or type your own"]
    end
    
    subgraph Patient["👤 Patient Choice"]
        Opts --> Click[Click 'Suddenly']
        Custom --> Type[Type custom answer]
    end
    
    subgraph Result["📤 Sent to AI"]
        Click --> Send1["Patient: 'Suddenly'"]
        Type --> Send2["Patient: [custom text]"]
        
        Send1 --> Natural["✅ Natural voice<br/>✅ Not robotic<br/>✅ Clinically useful"]
        Send2 --> Natural
    end
    
    Q1 --> Parse
    
    style Doctor fill:#e1e5ff
    style Engine fill:#fff4e1
    style Display fill:#e1f5e1
    style Patient fill:#ffe1f5
    style Result fill:#e1f5e1
    style Natural fill:#e1f5e1,stroke:#00aa00,stroke-width:3px
```

---

## Diagram 3: Clerking System Architecture

```mermaid
graph TB
    subgraph Input["User Input"]
        PatientMsg[Patient Message]
    end
    
    subgraph Coordinator["AgentCoordinator"]
        Receive[Receive Input]
        Receive --> UpdateSOAP[Update SOAP Notes]
        UpdateSOAP --> CheckPhase[Check Current Phase]
        CheckPhase --> Phase{Phase?}
        
        Phase -->|intake| IntakeLogic[Capture PC + Duration]
        Phase -->|assessment| AssessLogic[Gather HPC Elements]
        Phase -->|differential| DiffLogic[Systematic Review]
        Phase -->|resolution| ResLogic[Finalize Diagnosis]
    end
    
    subgraph AI["AI Processing"]
        IntakeLogic --> Prompt1[System Prompt:<br/>Consultant Physician]
        AssessLogic --> Prompt1
        DiffLogic --> Prompt1
        ResLogic --> Prompt1
        
        Prompt1 --> LLM[LLM Call]
        LLM --> Response[AI Response]
    end
    
    subgraph Validation["Programmatic Guardrails"]
        Response --> CheckDiag{Is Diagnosis<br/>Question?}
        CheckDiag -->|No| AllowQ[Allow Question]
        CheckDiag -->|Yes| ValidateHx[hasAdequateHistoryForDiagnosis]
        
        ValidateHx --> Check1{Min 5<br/>Questions?}
        Check1 -->|No| Block1[Block & Redirect]
        Check1 -->|Yes| Check2{Min 3<br/>HPC Elements?}
        Check2 -->|No| Block1
        Check2 -->|Yes| Check3{Appropriate<br/>Phase?}
        Check3 -->|No| Block1
        Check3 -->|Yes| AllowDiag[Allow Diagnosis]
        
        Block1 --> Fallback[Return Fallback Question]
    end
    
    subgraph Output["Output to User"]
        AllowQ --> Display[Display Question]
        AllowDiag --> Display
        Fallback --> Display
        
        Display --> Options[Generate Response Options]
        Options --> UI[Render UI]
    end
    
    PatientMsg --> Receive
    UI --> PatientMsg
    
    style Input fill:#e1f5e1
    style Coordinator fill:#e1e5ff
    style AI fill:#fff4e1
    style Validation fill:#ffe1e1
    style Output fill:#ffe1f5
    style Block1 fill:#ff6b6b,color:#fff
    style AllowDiag fill:#51cf66,color:#fff
```

---

## Diagram 4: HPC Element Coverage Flow

```mermaid
graph TD
    Start[Doctor Asks Question] --> Type{Question<br/>Type?}
    
    Type -->|PC| PC[Presenting Complaint<br/>Captured]
    Type -->|Duration| Dur[Duration Captured]
    Type -->|Onset| Onset[Onset: Sudden/Gradual]
    Type -->|Character| Char[Character: Sharp/Dull/etc]
    Type -->|Radiation| Rad[Radiation: Location]
    Type -->|Timing| Time[Timing: Constant/Intermittent]
    Type -->|Associated| Assoc[Associated Symptoms]
    Type -->|Exacerbating| Exac[Exacerbating Factors]
    Type -->|Relieving| Relieve[Relieving Factors]
    Type -->|Severity| Sev[Severity: 1-10 or Mild/Severe]
    Type -->|Progression| Prog[Progression: Better/Worse]
    
    PC --> SOAP[Update SOAP Notes]
    Dur --> SOAP
    Onset --> SOAP
    Char --> SOAP
    Rad --> SOAP
    Time --> SOAP
    Assoc --> SOAP
    Exac --> SOAP
    Relieve --> SOAP
    Sev --> SOAP
    Prog --> SOAP
    
    SOAP --> Count[Count HPC Elements]
    Count --> Check{HPC >= 3?}
    
    Check -->|No| Continue[Continue Assessment]
    Check -->|Yes| QCount{Questions >= 5?}
    
    QCount -->|No| Continue
    QCount -->|Yes| Ready[Ready for Diagnosis]
    
    Continue --> Start
    Ready --> Offer[Offer Working Diagnosis]
    
    style Start fill:#e1e5ff
    style SOAP fill:#fff4e1
    style Ready fill:#e1f5e1
    style Offer fill:#51cf66,color:#fff
```

---

## Usage Notes

These diagrams illustrate:

1. **Complete User Flow** - The entire journey from app launch to PDF export
2. **Response Options System** - How intelligent suggestions help patients answer naturally
3. **Clerking System Architecture** - The programmatic guardrails that ensure quality
4. **HPC Element Coverage** - How the system tracks clinical history completeness

All diagrams use Mermaid syntax and can be rendered in:
- GitHub markdown
- VS Code with Mermaid extension
- Documentation sites (GitBook, Docusaurus, etc.)
- Mermaid Live Editor (https://mermaid.live)

---

## Related Documentation

- `docs/FULL_USER_FLOW_ANALYSIS.md` - Detailed text analysis
- `docs/IMPROVED_CLERKING_SYSTEM.md` - Technical implementation
- `docs/RESPONSE_OPTIONS_ENHANCEMENT.md` - Options engine details
- `docs/WHY_PREVIOUS_APPROACH_FAILED.md` - Lessons learned

