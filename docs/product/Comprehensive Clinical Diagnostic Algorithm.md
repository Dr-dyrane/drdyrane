# Comprehensive Clinical Diagnostic Algorithm

Source: `Comprehensive Clinical Diagnostic Algorithm.pdf`
Pages: 5

## Page 1

Comprehensive Clinical Diagnostic Algorithm
This  document  outlines  a  clinical  diagnostic  algorithm built  from  the  synthesis  of  evidence‑based
techniques  discussed  in  The  Master  Craft  of  Clinical  History  Taking.  It  is  designed  to  be  integrated  into
Dr .Dyrane's UI to provide a  native‑feeling diagnostic reasoning engine. The algorithm replicates how
experienced  clinicians  combine  history  taking,  pattern  recognition,  structured  differential  generation,
Bayesian updating and intuitive judgment to arrive at safe, accurate diagnoses.
Overview
Inputs – Collect a structured history from the patient, including chief complaint, timeline of
symptoms, quality and triggers of each symptom, associated symptoms, risk factors, and
demographic/epidemiological context. Incorporate visual cues (appearance, posture, voice energy)
and basic vitals when available.
Processing pipeline – The reasoning engine runs a series of filters and updates: stability
assessment, syndrome classification, temporal patterning, risk contextualization, anchor clue
detection, differential generation, probability updating and ranking.
Outputs – A ranked differential diagnosis (top three most likely conditions), flagged dangerous
conditions that must not be missed, immediate management recommendations, and suggestions
for targeted examination or minimal confirmatory tests.
Step‑by‑Step Algorithm
1. Immediate Stability Check (Triage Layer)
Assess whether the patient is in immediate danger using simple questions and history cues. If any red flag
arises, the engine prioritizes emergent conditions and prompts the user (doctor or patient) to seek urgent
care.
Critical cues to listen for:
Cue Possible emergency
"Worst headache of life" subarachnoid haemorrhage
"Crushing chest pain + sweating"myocardial infarction
"Shortness of breath + cannot speak"respiratory distress / severe asthma / pulmonary embolism
"Vomiting blood" upper GI bleed
If the patient appears unstable (altered consciousness, airway compromise, extreme vital signs), flag as
emergent and bypass further steps.
1.
2.
3.
1

## Page 2

2. Rapid Pattern Recognition & Syndrome Identification (System 1)
Using the initial description, perform a  syndrome classification. Cluster the presented symptoms into
high‑level syndromes (e.g., respiratory infection, systemic inflammatory illness, gastrointestinal bleed). This
process is akin to pattern matching against stored illness scripts.
Parse the chief complaint and associated descriptors.
Identify symptom constellations such as "fever + cough + sputum" → respiratory infection; "fever +
rash + joint pain" → systemic inflammatory/infectious syndrome; "chest pain + dyspnoea +
haemoptysis" → cardio‑pulmonary cluster .
Generate a preliminary syndrome label and associated prototype diagnoses. This forms the basis for
the differential list.
3. Timeline Analysis
Classify the disease by its time course, which dramatically narrows possibilities:
Time frame Definition Likely processes
Hyperacuteseconds–
minutes
vascular catastrophes (stroke, pulmonary embolism, aortic
dissection, pneumothorax)
Acute hours–days infections or inflammatory processes (appendicitis, pneumonia,
meningitis, pancreatitis)
Subacute days–weeks TB, endocarditis, malignancy, autoimmune disease
Chronic months–yearscancer , endocrine disorders, degenerative or autoimmune diseases
Assign the patient to a temporal category based on when symptoms started and how they evolved. For
example, "two weeks of fever and cough" → subacute, immediately raising TB or endocarditis higher on the
list than influenza.
4. Risk Context & Epidemiological Fit
Overlay risk factors and demographics to adjust probabilities:
Age and sex (e.g., young woman → SLE more likely; older man with smoking history → CAD more
likely).
Occupation, travel history, exposures (e.g., travel to malaria zone → malaria; IV drug use →
endocarditis; immunosuppression → opportunistic infections).
Medications and lifestyle factors (e.g., oral contraceptive use → increased risk of pulmonary
embolism).
Family history and past medical history.
The engine modifies prior probabilities based on this context, increasing or decreasing the weight of certain
diagnoses.
1.
2.
3.
•
•
•
•
2

## Page 3

5. Anchor Symptom & High‑Weight Clue Detection
Search for  diagnostic hinges—symptoms that disproportionately increase or decrease the likelihood of
specific conditions. Examples:
Night sweats + weight loss → strongly suggests TB or lymphoma.
Sudden tearing chest pain → think aortic dissection.
Photophobia + neck stiffness → think meningitis.
Hemoptysis in a chronic cough → pushes TB or lung cancer much higher .
High‑weight clues cause the algorithm to rapidly adjust probabilities (Bayesian "likelihood multipliers").
6. Differential Generation via the Consultant Differential Engine
Use a structured differential engine to ensure no major category is missed. For each primary symptom:
Anatomical scan – List all organ systems that could produce the symptom from superficial to deep.
Example for chest pain: skin → muscle → bone → lung → pleura → heart → oesophagus → aorta.
Physiologic mechanisms – Consider pathophysiological categories (inflammation, obstruction,
ischemia, infection, neoplasm, toxic/metabolic, autoimmune).
Dangerous diagnoses – Immediately rule out "must not miss" life‑threatening conditions (e.g.,
myocardial infarction, pulmonary embolism, aortic dissection, pneumothorax, ruptured aneurysm).
Common diagnoses – Add the most frequent benign causes (GERD, musculoskeletal pain, anxiety,
viral infections). These account for most presentations.
Unusual diagnoses – Include less common but possible conditions based on context or exposures.
Seven super‑patterns – Map candidate diagnoses into broad categories to aid memory and pattern
detection:
Infectious (bacterial, viral, fungal, parasitic)
Inflammatory/autoimmune
Vascular (ischemic, haemorrhagic)
Neoplastic
Metabolic/endocrine
Degenerative (neurodegenerative, organ degeneration)
Toxic/iatrogenic (drug reactions, poisons)
By  systematically  scanning  these  categories,  the  algorithm  avoids  tunnel  vision  and  ensures  broad
coverage.
7. Bayesian Probability Updating
Implement a Bayesian loop to refine the differential:
Establish prior probabilities based on epidemiology and context (Step 4). For example, the prior
probability of myocardial infarction in a 25‑year‑old athlete is very low, whereas in a 65‑year‑old
diabetic smoker it is high.
•
•
•
•
1.
2.
3.
4.
5.
6.
7.
8.
9.
10.
11.
12.
13.
1.
3

## Page 4

Sequentially incorporate clues from the history. Each symptom or finding adjusts the probability of
each diagnosis up or down. Pain worse with breathing decreases MI likelihood but increases
pleurisy. Burning pain after meals decreases MI and increases GERD.
Weight anchor clues more heavily than generic symptoms.
Incorporate negative findings. Absence of exertional pain, radiation or diaphoresis reduces the
likelihood of MI.
Stop updating once the probability of a diagnosis crosses a decision threshold (e.g., when
pneumonia becomes sufficiently likely, the engine recommends treatment rather than further tests).
Though explicit numeric calculation is not required, the engine should maintain relative weights for each
candidate and update them with each new piece of information.
8. Targeted Questions & Negative Evidence
Use targeted follow‑up questions to further collapse the differential. For each candidate diagnosis, identify
a minimal set of distinguishing questions. Example for chest pain:
Question If "Yes" If "No"
Worse with deep breathingraises suspicion of pleurisy or PElowers likelihood of pleurisy/
PE
Related to exertion raises suspicion of angina/MIlowers MI probability
Burning after meals or lying
down raises suspicion of GERD lowers GERD likelihood
Sudden tearing quality raises suspicion of aortic
dissection lowers dissection probability
Simultaneously, register negative findings: the absence of fever reduces infectious etiologies; absence of
trauma reduces musculoskeletal causes.
9. Ranking & Safety Checks
After iterative updates, the engine should output:
Top three most likely diagnoses (ranked by adjusted probability).
High‑danger diagnosis that must not be missed (even if lower probability). For each dangerous
diagnosis, list the key symptoms that still need exclusion.
Immediate management instructions: when to call emergency services, when to seek urgent
evaluation, and what initial symptomatic relief can be attempted safely (e.g., simple analgesia for
musculoskeletal pain).
Recommended next steps: focused physical exam maneuvers and minimal confirmatory tests
(e.g., chest X‑ray for suspected pneumonia, ECG for suspected MI). Emphasise that tests are to
confirm, not discover , diagnoses.
Finally,  apply  Occam's  Razor:  choose  the  diagnosis  that  explains  all  the  symptoms  with  the  fewest
assumptions, but keep alternative diagnoses in mind (Hickam's dictum) if multiple processes are plausible.
2.
3.
4.
5.
•
•
•
•
4

## Page 5

10. Intuition & Bias Control
Incorporate the Diagnostic Intuition Loop to balance speed and safety:
System 1 (fast): allow the engine to suggest a tentative diagnosis based on pattern recognition of
illness scripts.
System 2 (slow): run the analytical algorithm described above to verify or refute the intuitive
impression.
Bias checks: incorporate safeguards against anchoring, availability bias and confirmation bias. For
example, ask the engine to consider at least one alternative explanation and to identify any recent
cases that might be unduly influencing the diagnosis.
11. Continuous Learning & Script Expansion
Each case processed by the engine should update the internal knowledge graph of illness scripts and their
patterns. Over time, the algorithm's pattern recognition library will expand and improve, similar to how
human clinicians build experience. Incorporate user feedback loops to refine probabilities and add new
patterns.
Integration Tips for UI Implementation
Modular design – Separate the UI components (forms for history input, visual dashboards for
differential ranking) from the reasoning engine. The algorithm functions can be exposed as API
endpoints or internal modules.
Responsive feedback – Provide immediate triage alerts if stability checks identify red flags. For less
urgent cases, display the evolving differential list and request further targeted history questions
interactively.
Clear risk communication – Highlight dangerous diagnoses with icons or colour coding. Offer
plain‑language explanations and emphasise when urgent medical attention is recommended.
Respect privacy and safety – Ensure that patient data is stored securely and that the engine does
not substitute for professional medical advice. Always include a disclaimer that the tool is for
educational assistance and that decisions should be confirmed by a qualified clinician.
This  algorithm  combines  the  nuanced  insights  of  master  clinicians with  the  structured  logic  of
computer  science.  By  integrating  it  into  Dr .Dyrane's  UI,  you  can  provide  users  with  a  powerful,
native‑feeling diagnostic experience that mirrors expert reasoning while remaining transparent and safe.
1.
2.
3.
•
•
•
•
5
