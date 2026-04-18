/* ═══════════════════════════════════════════════════
   UE School — Question Bank v1.0
   Format per question:
   { id, text, opts:[A,B,C,D], ans:0-3, topic, subject, examType, year?, explanation? }
═══════════════════════════════════════════════════ */

const QUESTION_BANK = (function () {

  const bank = [

    /* ══════════════════════════════════════════════
       MATHEMATICS
    ══════════════════════════════════════════════ */
    // Quadratics
    { id:'m001', subject:'mathematics', topic:'Quadratics', examType:'JAMB',
      text:'Solve x² − 5x + 6 = 0',
      opts:['x = 2 or x = 3','x = −2 or x = −3','x = 1 or x = 6','x = −1 or x = −6'], ans:0,
      explanation:'Factor: (x−2)(x−3)=0, so x=2 or x=3.' },
    { id:'m002', subject:'mathematics', topic:'Quadratics', examType:'WAEC',
      text:'Find the roots of 2x² − 7x + 3 = 0',
      opts:['x = 3 or x = ½','x = −3 or x = −½','x = 2 or x = 3','x = 1 or x = 3'], ans:0,
      explanation:'Using the formula or factoring: (2x−1)(x−3)=0 gives x=½ or x=3.' },
    { id:'m003', subject:'mathematics', topic:'Quadratics', examType:'JAMB',
      text:'The sum of the roots of 3x² − 9x + 4 = 0 is',
      opts:['3','9','4/3','−3'], ans:0,
      explanation:'Sum of roots = −b/a = 9/3 = 3.' },
    { id:'m004', subject:'mathematics', topic:'Quadratics', examType:'WAEC',
      text:'The product of the roots of x² + 5x − 6 = 0 is',
      opts:['−6','6','5','−5'], ans:0,
      explanation:'Product of roots = c/a = −6/1 = −6.' },
    { id:'m005', subject:'mathematics', topic:'Quadratics', examType:'NECO',
      text:'If α and β are roots of x² − 4x + 1 = 0, find α² + β²',
      opts:['14','18','12','16'], ans:0,
      explanation:'α²+β² = (α+β)²−2αβ = 16−2 = 14.' },

    // Indices
    { id:'m006', subject:'mathematics', topic:'Indices', examType:'JAMB',
      text:'Simplify 2³ × 2⁵ ÷ 2⁴',
      opts:['16','8','32','4'], ans:0,
      explanation:'2³⁺⁵⁻⁴ = 2⁴ = 16.' },
    { id:'m007', subject:'mathematics', topic:'Indices', examType:'WAEC',
      text:'Evaluate (27)^(2/3)',
      opts:['9','3','6','18'], ans:0,
      explanation:'27^(1/3)=3, then 3²=9.' },
    { id:'m008', subject:'mathematics', topic:'Indices', examType:'JAMB',
      text:'If 4^x = 32, find x',
      opts:['5/2','2/5','4','8'], ans:0,
      explanation:'2^(2x)=2^5, so 2x=5, x=5/2.' },
    { id:'m009', subject:'mathematics', topic:'Indices', examType:'NECO',
      text:'Simplify (x³y²)/(x y⁴)',
      opts:['x²/y²','x²y²','x/y²','y²/x²'], ans:0,
      explanation:'x^(3−1) · y^(2−4) = x²y^(−2) = x²/y².' },

    // Logarithms
    { id:'m010', subject:'mathematics', topic:'Logarithms', examType:'JAMB',
      text:'Evaluate log₂ 64',
      opts:['6','8','4','2'], ans:0,
      explanation:'2⁶=64, so log₂64=6.' },
    { id:'m011', subject:'mathematics', topic:'Logarithms', examType:'WAEC',
      text:'If log 2 = 0.3010, find log 8',
      opts:['0.9030','0.6020','1.2040','0.8030'], ans:0,
      explanation:'log 8 = log 2³ = 3 × 0.3010 = 0.9030.' },
    { id:'m012', subject:'mathematics', topic:'Logarithms', examType:'JAMB',
      text:'Simplify log 6 + log 5 − log 3',
      opts:['log 10','log 28','log 8','log 2'], ans:0,
      explanation:'log(6×5/3)=log 10=1.' },

    // Probability
    { id:'m013', subject:'mathematics', topic:'Probability', examType:'JAMB',
      text:'A bag contains 3 red and 5 blue balls. One ball is drawn at random. P(red) =',
      opts:['3/8','5/8','1/3','1/8'], ans:0 },
    { id:'m014', subject:'mathematics', topic:'Probability', examType:'WAEC',
      text:'Two dice are rolled. Find P(sum = 7)',
      opts:['1/6','1/36','1/12','7/36'], ans:0 },
    { id:'m015', subject:'mathematics', topic:'Probability', examType:'NECO',
      text:'P(A)=0.4, P(B)=0.3, P(A∩B)=0.1. Find P(A∪B)',
      opts:['0.6','0.7','0.5','0.4'], ans:0,
      explanation:'P(A∪B)=0.4+0.3−0.1=0.6.' },

    // Calculus
    { id:'m016', subject:'mathematics', topic:'Calculus', examType:'WAEC',
      text:'Find dy/dx if y = 3x² + 2x − 5',
      opts:['6x + 2','3x + 2','6x − 5','6x'], ans:0 },
    { id:'m017', subject:'mathematics', topic:'Calculus', examType:'JAMB',
      text:'If y = x³ − 6x² + 9x, find the value of x at the turning point',
      opts:['x = 1 or x = 3','x = 2 or x = 4','x = 0 or x = 3','x = 1 or x = 2'], ans:0,
      explanation:'dy/dx = 3x²−12x+9=0, so x²−4x+3=0, (x−1)(x−3)=0.' },

    // Statistics
    { id:'m018', subject:'mathematics', topic:'Statistics', examType:'JAMB',
      text:'Find the mean of 4, 7, 9, 11, 14',
      opts:['9','10','8','11'], ans:0,
      explanation:'(4+7+9+11+14)/5 = 45/5 = 9.' },
    { id:'m019', subject:'mathematics', topic:'Statistics', examType:'WAEC',
      text:'The median of 3, 7, 2, 9, 5 is',
      opts:['5','7','3','9'], ans:0,
      explanation:'Sorted: 2,3,5,7,9. Middle value = 5.' },
    { id:'m020', subject:'mathematics', topic:'Statistics', examType:'NECO',
      text:'The mode of 2, 3, 4, 3, 5, 3, 2 is',
      opts:['3','2','4','5'], ans:0 },

    /* ══════════════════════════════════════════════
       ENGLISH LANGUAGE
    ══════════════════════════════════════════════ */
    // Comprehension
    { id:'e001', subject:'english', topic:'Comprehension', examType:'WAEC',
      text:'Choose the word CLOSEST in meaning to "Benevolent"',
      opts:['Generous','Cruel','Strict','Ambitious'], ans:0 },
    { id:'e002', subject:'english', topic:'Comprehension', examType:'JAMB',
      text:'Choose the word OPPOSITE in meaning to "Diligent"',
      opts:['Lazy','Hardworking','Clever','Smart'], ans:0 },
    { id:'e003', subject:'english', topic:'Comprehension', examType:'NECO',
      text:'The word "Ephemeral" means',
      opts:['Short-lived','Eternal','Enormous','Ordinary'], ans:0 },

    // Lexis & Structure
    { id:'e004', subject:'english', topic:'Lexis & Structure', examType:'JAMB',
      text:'Choose the correct sentence: "Neither the boys nor the girl ___ present."',
      opts:['was','were','are','is not'], ans:0,
      explanation:'When "neither...nor" links subjects of different numbers, the verb agrees with the closer subject (girl = singular). "was" is correct.' },
    { id:'e005', subject:'english', topic:'Lexis & Structure', examType:'WAEC',
      text:'Identify the figure of speech: "The wind whispered through the trees."',
      opts:['Personification','Simile','Metaphor','Alliteration'], ans:0 },
    { id:'e006', subject:'english', topic:'Lexis & Structure', examType:'NECO',
      text:'The plural of "phenomenon" is',
      opts:['Phenomena','Phenomenons','Phenomen','Phenomenas'], ans:0 },
    { id:'e007', subject:'english', topic:'Lexis & Structure', examType:'JAMB',
      text:'Which sentence is grammatically CORRECT?',
      opts:['She has been waiting for an hour.','She has been wait for an hour.','She have been waiting for an hour.','She been waiting for an hour.'], ans:0 },
    { id:'e008', subject:'english', topic:'Lexis & Structure', examType:'WAEC',
      text:'"The pen is mightier than the sword." This is an example of',
      opts:['Metaphor','Simile','Personification','Hyperbole'], ans:0 },

    // Essay Writing
    { id:'e009', subject:'english', topic:'Essay Writing', examType:'WAEC',
      text:'A formal letter ends with',
      opts:['Yours faithfully','Yours sincerely','Best regards','Warm regards'], ans:0,
      explanation:'"Yours faithfully" is used when you begin with Dear Sir/Madam (unknown recipient).' },
    { id:'e010', subject:'english', topic:'Essay Writing', examType:'JAMB',
      text:'The introduction of an essay should',
      opts:['State the main idea and engage the reader','Summarise the entire essay','List all arguments','Give the conclusion first'], ans:0 },

    // Oral English
    { id:'e011', subject:'english', topic:'Oral English', examType:'JAMB',
      text:'Which word has the stress on the SECOND syllable?',
      opts:['reCORD (verb)','REcord (noun)','COMfort','TAble'], ans:0 },
    { id:'e012', subject:'english', topic:'Oral English', examType:'WAEC',
      text:'The silent letter in "knight" is',
      opts:['k','n','g','h'], ans:0 },

    /* ══════════════════════════════════════════════
       PHYSICS
    ══════════════════════════════════════════════ */
    // Mechanics
    { id:'p001', subject:'physics', topic:'Mechanics', examType:'JAMB',
      text:'A body accelerates at 4 m/s² from rest. Its velocity after 5s is',
      opts:['20 m/s','25 m/s','10 m/s','15 m/s'], ans:0,
      explanation:'v = u + at = 0 + 4×5 = 20 m/s.' },
    { id:'p002', subject:'physics', topic:'Mechanics', examType:'WAEC',
      text:'The SI unit of force is',
      opts:['Newton','Pascal','Joule','Watt'], ans:0 },
    { id:'p003', subject:'physics', topic:'Mechanics', examType:'NECO',
      text:'An object of mass 5kg moves with velocity 10 m/s. Its kinetic energy is',
      opts:['250 J','500 J','50 J','25 J'], ans:0,
      explanation:'KE = ½mv² = ½×5×100 = 250 J.' },
    { id:'p004', subject:'physics', topic:'Mechanics', examType:'JAMB',
      text:'Newton\'s first law of motion is also called the law of',
      opts:['Inertia','Momentum','Action-Reaction','Acceleration'], ans:0 },

    // Waves
    { id:'p005', subject:'physics', topic:'Waves', examType:'JAMB',
      text:'The speed of light in a vacuum is approximately',
      opts:['3×10⁸ m/s','3×10⁶ m/s','3×10¹⁰ m/s','3×10⁴ m/s'], ans:0 },
    { id:'p006', subject:'physics', topic:'Waves', examType:'WAEC',
      text:'The frequency of a wave is 50 Hz and its wavelength is 4m. Its speed is',
      opts:['200 m/s','12.5 m/s','54 m/s','46 m/s'], ans:0,
      explanation:'v = fλ = 50×4 = 200 m/s.' },
    { id:'p007', subject:'physics', topic:'Waves', examType:'NECO',
      text:'Which type of wave does NOT require a medium for propagation?',
      opts:['Electromagnetic','Sound','Water','Seismic'], ans:0 },

    // Electricity
    { id:'p008', subject:'physics', topic:'Electricity', examType:'JAMB',
      text:'Ohm\'s Law states that V = IR, where R is',
      opts:['Resistance','Reactance','Reluctance','Refractive index'], ans:0 },
    { id:'p009', subject:'physics', topic:'Electricity', examType:'WAEC',
      text:'A 12V battery is connected to a 4Ω resistor. Current flowing is',
      opts:['3 A','4 A','48 A','8 A'], ans:0,
      explanation:'I = V/R = 12/4 = 3 A.' },
    { id:'p010', subject:'physics', topic:'Electricity', examType:'NECO',
      text:'The unit of electrical power is',
      opts:['Watt','Joule','Ampere','Ohm'], ans:0 },

    // Optics
    { id:'p011', subject:'physics', topic:'Optics', examType:'JAMB',
      text:'A concave mirror is also called a',
      opts:['Converging mirror','Diverging mirror','Plane mirror','Convex mirror'], ans:0 },
    { id:'p012', subject:'physics', topic:'Optics', examType:'WAEC',
      text:'The bending of light as it passes from one medium to another is called',
      opts:['Refraction','Reflection','Diffraction','Dispersion'], ans:0 },

    /* ══════════════════════════════════════════════
       CHEMISTRY
    ══════════════════════════════════════════════ */
    // Periodic Table
    { id:'c001', subject:'chemistry', topic:'Periodic Table', examType:'JAMB',
      text:'The element with atomic number 11 is',
      opts:['Sodium','Magnesium','Potassium','Chlorine'], ans:0 },
    { id:'c002', subject:'chemistry', topic:'Periodic Table', examType:'WAEC',
      text:'Halogens are found in Group',
      opts:['VII','I','VI','VIII'], ans:0 },
    { id:'c003', subject:'chemistry', topic:'Periodic Table', examType:'NECO',
      text:'Noble gases have a valence electron configuration of',
      opts:['8 (except He with 2)','2','6','7'], ans:0 },

    // Acids & Bases
    { id:'c004', subject:'chemistry', topic:'Acids & Bases', examType:'JAMB',
      text:'An acid has a pH value',
      opts:['Less than 7','Greater than 7','Equal to 7','Greater than 14'], ans:0 },
    { id:'c005', subject:'chemistry', topic:'Acids & Bases', examType:'WAEC',
      text:'The reaction between an acid and a base is called',
      opts:['Neutralisation','Oxidation','Reduction','Combustion'], ans:0 },
    { id:'c006', subject:'chemistry', topic:'Acids & Bases', examType:'NECO',
      text:'HCl dissolved in water gives',
      opts:['H⁺ and Cl⁻','H₂ and Cl₂','OH⁻ and Cl⁻','H⁺ and OH⁻'], ans:0 },

    // Organic Chemistry
    { id:'c007', subject:'chemistry', topic:'Organic Chemistry', examType:'JAMB',
      text:'The simplest alkane is',
      opts:['Methane','Ethane','Propane','Butane'], ans:0 },
    { id:'c008', subject:'chemistry', topic:'Organic Chemistry', examType:'WAEC',
      text:'Alkenes are characterised by a',
      opts:['Double carbon bond','Single bond','Triple bond','Ionic bond'], ans:0 },
    { id:'c009', subject:'chemistry', topic:'Organic Chemistry', examType:'NECO',
      text:'The functional group −COOH is found in',
      opts:['Carboxylic acids','Alcohols','Esters','Aldehydes'], ans:0 },

    // Electrochemistry
    { id:'c010', subject:'chemistry', topic:'Electrochemistry', examType:'JAMB',
      text:'In electrolysis, oxidation occurs at the',
      opts:['Anode','Cathode','Electrolyte','Both electrodes'], ans:0 },
    { id:'c011', subject:'chemistry', topic:'Electrochemistry', examType:'WAEC',
      text:'Faraday\'s first law of electrolysis states that the mass deposited is proportional to',
      opts:['Quantity of charge','Voltage','Resistance','Temperature'], ans:0 },

    /* ══════════════════════════════════════════════
       BIOLOGY
    ══════════════════════════════════════════════ */
    { id:'b001', subject:'biology', topic:'Cell Biology', examType:'JAMB',
      text:'The powerhouse of the cell is the',
      opts:['Mitochondria','Nucleus','Ribosome','Golgi body'], ans:0 },
    { id:'b002', subject:'biology', topic:'Cell Biology', examType:'WAEC',
      text:'The process by which plants make food using sunlight is called',
      opts:['Photosynthesis','Respiration','Transpiration','Osmosis'], ans:0 },
    { id:'b003', subject:'biology', topic:'Genetics', examType:'JAMB',
      text:'DNA stands for',
      opts:['Deoxyribonucleic Acid','Deoxyribose Nucleic Acid','Dinucleotide Acid','Deoxyribonuclei Acid'], ans:0 },
    { id:'b004', subject:'biology', topic:'Genetics', examType:'WAEC',
      text:'The law of segregation was proposed by',
      opts:['Gregor Mendel','Charles Darwin','Louis Pasteur','Alexander Fleming'], ans:0 },
    { id:'b005', subject:'biology', topic:'Ecology', examType:'NECO',
      text:'Producers in a food chain are',
      opts:['Green plants','Herbivores','Carnivores','Decomposers'], ans:0 },
    { id:'b006', subject:'biology', topic:'Nutrition', examType:'JAMB',
      text:'Vitamin C deficiency causes',
      opts:['Scurvy','Rickets','Beriberi','Kwashiorkor'], ans:0 },
    { id:'b007', subject:'biology', topic:'Cell Biology', examType:'WAEC',
      text:'Osmosis is the movement of water from a region of',
      opts:['Low to high solute concentration','High to low solute concentration','High to low temperature','Low to high pressure'], ans:0 },
    { id:'b008', subject:'biology', topic:'Evolution', examType:'JAMB',
      text:'Charles Darwin\'s theory of evolution is based on',
      opts:['Natural selection','Artificial selection','Mutation only','Inheritance only'], ans:0 },

    /* ══════════════════════════════════════════════
       ECONOMICS
    ══════════════════════════════════════════════ */
    { id:'ec001', subject:'economics', topic:'Supply & Demand', examType:'JAMB',
      text:'When the price of a good rises and demand falls, this illustrates the law of',
      opts:['Demand','Supply','Diminishing returns','Substitution'], ans:0 },
    { id:'ec002', subject:'economics', topic:'Supply & Demand', examType:'WAEC',
      text:'Price elasticity of demand measures responsiveness of quantity demanded to changes in',
      opts:['Price','Income','Supply','Tastes'], ans:0 },
    { id:'ec003', subject:'economics', topic:'National Income', examType:'JAMB',
      text:'GDP stands for',
      opts:['Gross Domestic Product','Gross Domestic Price','General Domestic Product','Gross Demand Production'], ans:0 },
    { id:'ec004', subject:'economics', topic:'Money & Banking', examType:'WAEC',
      text:'The central bank of Nigeria is',
      opts:['Central Bank of Nigeria','First Bank','UBA','Access Bank'], ans:0 },
    { id:'ec005', subject:'economics', topic:'Trade', examType:'NECO',
      text:'Comparative advantage refers to producing goods at a',
      opts:['Lower opportunity cost','Higher profit','Lower price','Higher quality'], ans:0 },
    { id:'ec006', subject:'economics', topic:'Development', examType:'JAMB',
      text:'Inflation means',
      opts:['A sustained rise in the general price level','A fall in prices','An increase in GDP','A decrease in unemployment'], ans:0 },

    /* ══════════════════════════════════════════════
       GOVERNMENT
    ══════════════════════════════════════════════ */
    { id:'g001', subject:'government', topic:'Constitution', examType:'JAMB',
      text:'The Nigerian constitution in current use was adopted in',
      opts:['1999','1979','1963','1960'], ans:0 },
    { id:'g002', subject:'government', topic:'Legislature', examType:'WAEC',
      text:'The upper chamber of Nigeria\'s National Assembly is the',
      opts:['Senate','House of Representatives','State Assembly','Federal Executive Council'], ans:0 },
    { id:'g003', subject:'government', topic:'Executive', examType:'NECO',
      text:'The head of government in a presidential system is the',
      opts:['President','Prime Minister','Chancellor','Governor-General'], ans:0 },
    { id:'g004', subject:'government', topic:'Judiciary', examType:'JAMB',
      text:'The highest court in Nigeria is the',
      opts:['Supreme Court','Court of Appeal','Federal High Court','Sharia Court'], ans:0 },

  ]; // end bank array

  // ── Public API ────────────────────────────────────

  // Get questions filtered by subject, topic, examType
  function getQuestions({ subject, topic, examType, count = 10 } = {}) {
    let filtered = [...bank];
    if (subject)  filtered = filtered.filter(q => q.subject === subject.toLowerCase());
    if (topic)    filtered = filtered.filter(q => q.topic === topic);
    if (examType) filtered = filtered.filter(q => q.examType === examType);

    // Shuffle
    filtered = filtered.sort(() => Math.random() - 0.5);

    return filtered.slice(0, Math.min(count, filtered.length));
  }

  // Get questions for a full mock exam (multiple subjects)
  function getMockExam(subjects, examType = 'JAMB', totalQuestions = 40) {
    const perSubject = Math.floor(totalQuestions / subjects.length);
    let questions = [];
    for (const subj of subjects) {
      const qs = getQuestions({ subject: subj, examType, count: perSubject });
      questions = questions.concat(qs);
    }
    // Top up if needed
    if (questions.length < totalQuestions) {
      const extra = getQuestions({ examType, count: totalQuestions - questions.length });
      questions = questions.concat(extra.filter(q => !questions.find(x => x.id === q.id)));
    }
    return questions.sort(() => Math.random() - 0.5).slice(0, totalQuestions);
  }

  // Get all subjects available
  function getSubjects() {
    return [...new Set(bank.map(q => q.subject))];
  }

  // Get topics for a subject
  function getTopics(subject) {
    return [...new Set(bank.filter(q => q.subject === subject.toLowerCase()).map(q => q.topic))];
  }

  // Get count for a subject
  function countFor(subject, topic) {
    let b = bank.filter(q => q.subject === subject.toLowerCase());
    if (topic) b = b.filter(q => q.topic === topic);
    return b.length;
  }

  return { getQuestions, getMockExam, getSubjects, getTopics, countFor, _bank: bank };

})();
