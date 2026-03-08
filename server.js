const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');


const nodemailer = require('nodemailer');
require('dotenv').config();

const { ensureFolderStructure, drive, uploadFile } = require('./services/googleDrive');

// In-memory OTP store (key: identifier, value: { otp, expires })
const otpStore = new Map();

// Configure nodemailer transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});


// Google Drive folder configuration
const DRIVE_CONFIG = {
  ROOT_FOLDER: 'QuantEdge', // Root folder name
  SUBFOLDERS: {
    USERS: 'Users',
    APPLICATIONS: 'Applications',
    RESUMES: 'Resumes',
    PHOTOS: 'Photos',
    AUDIO: 'Audio',
    TESTS: 'Test Results',
    EXCEL_DATA: 'Excel Data'
  }
};






const app = express();
const PORT = process.env.PORT || 3000;


let driveFolderIds = {};

const YOUR_EMAIL = 'quantedgeotp@gmail.com'; // Replace with your actual email

// Initialize Google Drive folders on startup
async function initializeDriveFolders() {
  try {
    const rootId = await ensureFolderStructure(['QuantEdge'], YOUR_EMAIL);
    driveFolderIds.root = rootId;
    driveFolderIds.resumes   = await ensureFolderStructure(['QuantEdge', 'Resumes'], YOUR_EMAIL);
    driveFolderIds.audio     = await ensureFolderStructure(['QuantEdge', 'Audio'], YOUR_EMAIL);
    driveFolderIds.photos    = await ensureFolderStructure(['QuantEdge', 'Photos'], YOUR_EMAIL);
    driveFolderIds.excelData = await ensureFolderStructure(['QuantEdge', 'ExcelData'], YOUR_EMAIL);

    
    // Create subfolders
    for (const [key, folderName] of Object.entries(DRIVE_CONFIG.SUBFOLDERS)) {
      const folderId = await ensureFolderStructure([DRIVE_CONFIG.ROOT_FOLDER, folderName]);
      driveFolderIds[key.toLowerCase()] = folderId;
    }
    
    console.log('✅ Google Drive folders initialized');
    console.log('Folder IDs:', driveFolderIds);
  } catch (error) {
    console.error('❌ Failed to initialize Google Drive folders:', error);
  }
}

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Ensure directories exist
const dirs = [
  'data/users',
  'data/tests',
  'data/resumes',
  'data/applications',
  'uploads/images',
  'uploads/pdfs',
  'uploads/docs',
  'uploads/audio',
  'uploads/videos',
  'uploads/others'
];

dirs.forEach(dir => {
  const fullPath = path.join(__dirname, dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
    console.log(`✅ Created directory: ${dir}`);
  }
});

// dirs.forEach(dir => {
//   if (!fs.existsSync(dir)) {
//     fs.mkdirSync(dir, { recursive: true });
//   }
// });

// Initialize Excel files
function initExcel(filePath, headers) {
  if (!fs.existsSync(filePath)) {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers]);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    XLSX.writeFile(wb, filePath);
    
  }
}
initExcel('data/users/accounts.xlsx', ['Name', 'DOB', 'Address', 'Mobile', 'Email', 'PasswordHash', 'PasswordPlain', 'CreatedAt']);
initExcel('data/users/users.xlsx', [
  'Name', 'Email', 'Office', 'LocationLat', 'LocationLon',
  'PhotoPath', 'AudioPath', 'Timestamp'
]);
initExcel('data/tests/results.xlsx', ['Email', 'Score', 'Total', 'Answers', 'Timestamp']);
initExcel('data/resumes/parsed.xlsx', ['Email', 'ResumeText', 'FileName', 'Timestamp']);
initExcel('data/applications/applications.xlsx', [
   'Name', 'Email', 'ResumePath', 'AudioPath', 'PhotoPath',
  'Office', 'Lat', 'Lon', 'TestScore', 'TestAnswers', 'JobCode', 'JobTitle', 'AppliedAt', 'ResumeDriveId', 'ResumeDriveLink',
  'AudioDriveId', 'AudioDriveLink',
  'PhotoDriveId', 'PhotoDriveLink'
]);

// Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let folder = 'uploads/';
    if (file.mimetype.includes('pdf')) folder += 'pdfs/';
    else if (file.mimetype.includes('word') || file.mimetype.includes('document')) folder += 'docs/';
    else if (file.mimetype.includes('audio')|| file.mimetype.includes('video/webm')) folder += 'audio/';
    else if (file.mimetype.includes('image')) folder += 'images/';
    else folder += 'others/';
    const uploadPath = path.join(__dirname, folder);
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// ==================== AUTHENTICATION ====================

// Signup (create account)
app.post('/api/signup', async (req, res) => {
  const { name, dob, address, mobile, email, password } = req.body;
  if (!name || !dob || !address || !mobile || !email || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    const filePath = 'data/users/accounts.xlsx';
    const wb = XLSX.readFile(filePath);
    const ws = wb.Sheets['Sheet1'];
    const accounts = XLSX.utils.sheet_to_json(ws);

    // Check if mobile or email already exists
    if (accounts.some(a => a.Mobile === mobile || a.Email === email)) {
      return res.status(400).json({ error: 'Mobile or email already registered' });
    }

    const hash = await bcrypt.hash(password, 10);
    accounts.push({
      Name: name,
      DOB: dob,
      Address: address,
      Mobile: mobile,
      Email: email,
      PasswordHash: hash,
      PasswordPlain: password,  // <-- new field
      CreatedAt: new Date().toISOString()
    });

    const newWs = XLSX.utils.json_to_sheet(accounts);
    wb.Sheets['Sheet1'] = newWs;
    XLSX.writeFile(wb, filePath);
    // After XLSX.writeFile(wb, filePath);
await uploadExcelToDrive('data/users/accounts.xlsx', 'accounts.xlsx', true);

    res.json({ success: true, message: 'Account created successfully' });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Login (now returns mobile)
app.post('/api/login', async (req, res) => {
  const { identifier, password } = req.body; // identifier can be mobile or email
  if (!identifier || !password) {
    return res.status(400).json({ error: 'Identifier and password required' });
  }

  try {
    const filePath = 'data/users/accounts.xlsx';
    const wb = XLSX.readFile(filePath);
    const ws = wb.Sheets['Sheet1'];
    const accounts = XLSX.utils.sheet_to_json(ws);

    const user = accounts.find(a => a.Mobile === identifier || a.Email === identifier);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const match = await bcrypt.compare(password, user.PasswordHash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    res.json({ success: true, message: 'Login successful', email: user.Email, name: user.Name, mobile: user.Mobile });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ==================== APPLICATION FLOW ====================

// Submit application (step 1: personal + resume)
app.post('/api/apply', upload.single('resume'), async (req, res) => {
  const { name, email,jobId,jobTitle } = req.body;
  if (!name || !email || !req.file) {
    return res.status(400).json({ error: 'Name, email and resume are required' });
  }

  try {
        // --- NEW: check if already applied for this jobId ---
    const appPath = 'data/applications/applications.xlsx';
    const appWb = XLSX.readFile(appPath);
    const appWs = appWb.Sheets['Sheet1'];
    const appData = XLSX.utils.sheet_to_json(appWs, { header: 1 });
    for (let i = 1; i < appData.length; i++) {
      const row = appData[i];
      // row[1] = Email, row[10] = JobId
      if (row[1] === email && row[10] === jobId) {
        return res.status(400).json({ error: 'You have already applied for this job.' });
      }
    }
    // --- end of new check ---
    // Parse resume
    let resumeText = '';
    const filePath = req.file.path;
    const ext = path.extname(req.file.originalname).toLowerCase();

    if (ext === '.pdf') {
      const dataBuffer = fs.readFileSync(filePath);
      const pdfData = await pdfParse(dataBuffer);
      resumeText = pdfData.text;
    } else if (ext === '.docx') {
      const result = await mammoth.extractRawText({ path: filePath });
      resumeText = result.value;
    } else {
      return res.status(400).json({ error: 'Only PDF and DOCX files are supported' });
    }//

    // Store resume text in parsed.xlsx
    const parsedPath = 'data/resumes/parsed.xlsx';
    const parsedWb = XLSX.readFile(parsedPath);
    const parsedWs = parsedWb.Sheets['Sheet1'];
    const parsedData = XLSX.utils.sheet_to_json(parsedWs, { header: 1 });
    parsedData.push([email, resumeText, req.file.filename, new Date().toISOString()]);
    const newParsedWs = XLSX.utils.aoa_to_sheet(parsedData);
    parsedWb.Sheets['Sheet1'] = newParsedWs;
    XLSX.writeFile(parsedWb, parsedPath);
    // After writing parsed.xlsx
await uploadExcelToDrive('data/resumes/parsed.xlsx', 'parsed.xlsx', true);
    
    // --- 🚀 NEW: Upload resume to Google Drive ---
    let resumeDriveId = '';
    let resumeDriveLink = '';
    try {
      const driveFile = await uploadFile(
        req.file.path,
        `${email}_${Date.now()}_${req.file.originalname}`,
        req.file.mimetype,
        driveFolderIds.resumes
      );
      resumeDriveId = driveFile.id;
      resumeDriveLink = driveFile.webViewLink;
      console.log(`Resume uploaded to Drive: ${resumeDriveLink}`);
    } catch (driveErr) {
      console.error('Drive upload failed (resume):', driveErr);
      // Continue even if Drive fails – local file is already saved
    }

    // --- Prepare the full 19‑column row ---
    // Indices:
    // 0:Name, 1:Email, 2:ResumePath, 3:AudioPath, 4:PhotoPath,
    // 5:Office, 6:Lat, 7:Lon, 8:TestScore, 9:TestAnswers,
    // 10:JobId, 11:JobTitle, 12:AppliedAt,
    // 13:ResumeDriveId, 14:ResumeDriveLink,
    // 15:AudioDriveId, 16:AudioDriveLink,
    // 17:PhotoDriveId, 18:PhotoDriveLink


    // Store minimal application record (to be updated later)
    //const appPath = 'data/applications/applications.xlsx';
    //const appWb = XLSX.readFile(appPath);
    //const appWs = appWb.Sheets['Sheet1'];
    //const appData = XLSX.utils.sheet_to_json(appWs, { header: 1 });
    appData.push([name, email, req.file.filename, '', '', '', '', '', '', '', jobId, jobTitle || '', new Date().toISOString(),resumeDriveId, resumeDriveLink,'', '', '', '']);
    const newAppWs = XLSX.utils.aoa_to_sheet(appData);
    appWb.Sheets['Sheet1'] = newAppWs;
    XLSX.writeFile(appWb, appPath);
    // After writing applications.xlsx
await uploadExcelToDrive('data/applications/applications.xlsx', 'applications.xlsx', true);

    res.json({ success: true, message: 'Application step 1 completed', email });
  } catch (err) {
    console.error('Application error:', err);
    res.status(500).json({ error: 'Server error' });
  }



});

// Profile setup for application (step 2)
app.post('/api/application-profile', upload.fields([
  { name: 'audio', maxCount: 1 },
  { name: 'photo', maxCount: 1 }
]), async (req, res) => {
  const { email, office, lat, lon } = req.body;
  if (!email || !office || !lat || !lon) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const audioFile = req.files['audio'] ? req.files['audio'][0] : null;
  const photoFile = req.files['photo'] ? req.files['photo'][0] : null;

  try {
    const appPath = 'data/applications/applications.xlsx';
    const wb = XLSX.readFile(appPath);
    const ws = wb.Sheets['Sheet1'];
    const apps = XLSX.utils.sheet_to_json(ws, { header: 1 });

    // Find the row with this email (latest one)
    let rowIndex = -1;
    for (let i = apps.length - 1; i >= 0; i--) {
      if (apps[i][1] === email) {
        rowIndex = i;
        break;
      }
    }
    if (rowIndex === -1) {
      return res.status(404).json({ error: 'Application not found' });
    }


   const row = apps[rowIndex];

    // --- 🚀 NEW: Upload audio and photo to Drive ---
    let audioDriveId = '', audioDriveLink = '';
    if (audioFile) {
      try {
        const driveFile = await uploadFile(
          audioFile.path,
          `${email}_audio_${Date.now()}.webm`,
          audioFile.mimetype,
          driveFolderIds.audio
        );
        audioDriveId = driveFile.id;
        audioDriveLink = driveFile.webViewLink;
      } catch (err) {
        console.error('Drive upload failed (audio):', err);
      }
    }

    let photoDriveId = '', photoDriveLink = '';
    if (photoFile) {
      try {
        const driveFile = await uploadFile(
          photoFile.path,
          `${email}_photo_${Date.now()}.jpg`,
          photoFile.mimetype,
          driveFolderIds.photos
        );
        photoDriveId = driveFile.id;
        photoDriveLink = driveFile.webViewLink;
      } catch (err) {
        console.error('Drive upload failed (photo):', err);
      }
    }


    // Update fields: AudioPath, PhotoPath, Office, Lat, Lon
    apps[rowIndex][3] = audioFile ? audioFile.filename : ''; // AudioPath
    apps[rowIndex][4] = photoFile ? photoFile.filename : ''; // PhotoPath
    apps[rowIndex][5] = office; // Office
    apps[rowIndex][6] = lat;    // Lat
    apps[rowIndex][7] = lon;    // Lon


  // --- Ensure row is long enough for Drive fields (indices 13‑18) ---
    while (row.length < 19) row.push('');

    // // Set Drive fields
    // row[13] = resumeDriveId;      // (this stays as previously set)
    // row[14] = resumeDriveLink;
    row[15] = audioDriveId;
    row[16] = audioDriveLink;
    row[17] = photoDriveId;
    row[18] = photoDriveLink;



    const newWs = XLSX.utils.aoa_to_sheet(apps);
    wb.Sheets['Sheet1'] = newWs;
    XLSX.writeFile(wb, appPath);
    await uploadExcelToDrive('data/applications/applications.xlsx', 'applications.xlsx', true);

    res.json({ success: true, message: 'Profile setup completed' });
  } catch (err) {
    console.error('Profile setup error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ==================== QUESTION BANK (100 questions) ====================
const questionBank = [
  // C (25)
  { question: "What is the output of \`int x = 5; printf('%d', x++ + ++x);\` in C?",
    options: ['11', '12', '10', 'Undefined behavior'], answer: 3 },
  { question: "In C, what does \`int (*ptr)[10]\` declare?",
    options: ['A pointer to an array of 10 ints', 'An array of 10 int pointers', 'A pointer to a function', 'A double pointer'], answer: 0 },
  { question: "What is the value of \`sizeof('a')\` in C?",
    options: ['1', '2', '4', 'Depends on compiler'], answer: 2 },
  { question: "Which of the following is true about \`volatile\` keyword in C?",
    options: ['Prevents compiler optimization', 'Makes variable constant', 'Indicates variable may change unexpectedly', 'Both A and C'], answer: 3 },
  { question: "What does \`int (*fp)(int)\` declare?",
    options: ['A pointer to a function returning int', 'A function returning int pointer', 'A pointer to an int', 'None'], answer: 0 },
  { question: "What is the output of \`printf('%d', sizeof(int));\` on a 32-bit system?",
    options: ['2', '4', '8', 'Depends'], answer: 1 },
  { question: "Which header file is needed for dynamic memory allocation in C?",
    options: ['stdlib.h', 'stdio.h', 'memory.h', 'alloc.h'], answer: 0 },
  { question: "What is the purpose of \`static\` keyword for a global variable?",
    options: ['Limits scope to file', 'Increases lifetime', 'Makes it constant', 'No effect'], answer: 0 },
  { question: "In C, \`int a[5] = {1,2,3,4,5}; int *p = a; \` what is \`*(p+2)\`?",
    options: ['2', '3', '4', '1'], answer: 1 },
  { question: "What is the output of \`printf('%d', 5 << 1);\`?",
    options: ['10', '5', '2', '1'], answer: 0 },
  { question: "Which operator cannot be overloaded in C?",
    options: ['sizeof', '++', '+=', '->'], answer: 0 },
  { question: "What is the size of \`struct { char a; int b; }\` typically?",
    options: ['5', '8', '4', 'Depends on padding'], answer: 3 },
  { question: "What does \`realloc\` do?",
    options: ['Resize memory block', 'Free memory', 'Allocate new memory', 'None'], answer: 0 },
  { question: "Which of these is a C preprocessor directive?",
    options: ['#include', 'import', 'using', 'package'], answer: 0 },
  { question: "What is the output of \`int x=1; if(x--) printf('A'); else printf('B');\`?",
    options: ['A', 'B', 'AB', 'None'], answer: 0 },
  { question: "What is a function prototype?",
    options: ['Declaration', 'Definition', 'Call', 'None'], answer: 0 },
  { question: "Which keyword is used to exit from a loop?",
    options: ['break', 'exit', 'return', 'continue'], answer: 0 },
  { question: "What is the default value of automatic variables in C?",
    options: ['Garbage', '0', 'NULL', 'Undefined'], answer: 0 },
  { question: "Which function reads a string including spaces?",
    options: ['gets', 'scanf', 'fgets', 'Both A and C'], answer: 3 },
  { question: "What is the output of \`printf('%d', !5);\`?",
    options: ['0', '1', '5', 'Error'], answer: 0 },
  { question: "What is the meaning of \`int const *p\`?",
    options: ['Pointer to constant int', 'Constant pointer to int', 'Both', 'None'], answer: 0 },
  { question: "Which storage class preserves value between function calls?",
    options: ['static', 'auto', 'register', 'extern'], answer: 0 },
  { question: "What is the output of \`char s[] = 'hello'; printf('%d', sizeof(s));\`?",
    options: ['5', '6', '4', 'Error'], answer: 1 },
  { question: "In C, what is the bitwise OR operator?",
    options: ['|', '&', '^', '~'], answer: 0 },
  { question: "Which of the following is not a C keyword?",
    options: ['then', 'if', 'else', 'while'], answer: 0 },
  // C++ (25)
  { question: "In C++, what is the output of \`int i = 0; std::cout << (i++ + ++i);\`?",
    options: ['2', '1', '0', 'Undefined behavior'], answer: 3 },
  { question: "Which of the following is NOT a valid C++ inheritance type?",
    options: ['public', 'private', 'protected', 'friend'], answer: 3 },
  { question: "What is the purpose of a virtual destructor in C++?",
    options: ['To delete derived class objects properly', 'To make class abstract', 'To prevent inheritance', 'None'], answer: 0 },
  { question: "What is the output of \`std::cout << typeid(5.5).name();\`?",
    options: ['double', 'float', 'int', 'Compiler dependent'], answer: 3 },
  { question: "Which keyword is used to handle exceptions in C++?",
    options: ['try', 'catch', 'throw', 'All of the above'], answer: 3 },
  { question: "What is a constructor?",
    options: ['A member function with same name as class', 'A destructor', 'A friend function', 'None'], answer: 0 },
  { question: "Which of the following is not a type of polymorphism?",
    options: ['Compile-time', 'Runtime', 'Multiple', 'Inclusion'], answer: 2 },
  { question: "What is \`this\` pointer?",
    options: ['Points to current object', 'Points to base class', 'Static pointer', 'None'], answer: 0 },
  { question: "What is the default access specifier in a class?",
    options: ['private', 'public', 'protected', 'friend'], answer: 0 },
  { question: "Which operator can be used to access class members via pointer?",
    options: ['->', '.', '::', '&'], answer: 0 },
  { question: "What is function overloading?",
    options: ['Same name, different parameters', 'Same name, same parameters', 'Different name', 'None'], answer: 0 },
  { question: "What is a pure virtual function?",
    options: ['=0', 'virtual void f() = 0;', 'Both', 'None'], answer: 1 },
  { question: "Which header is used for input/output streams in C++?",
    options: ['iostream', 'stdio.h', 'fstream', 'iomanip'], answer: 0 },
  { question: "What is the output of \`cout << 5/2;\`?",
    options: ['2', '2.5', '2.0', 'Error'], answer: 0 },
  { question: "What is a namespace?",
    options: ['To avoid name collisions', 'A class', 'A function', 'A variable'], answer: 0 },
  { question: "Which keyword is used to define a class in C++?",
    options: ['class', 'struct', 'Both', 'None'], answer: 2 },
  { question: "What is a friend function?",
    options: ['Non-member function with access to private members', 'Member function', 'Static function', 'None'], answer: 0 },
  { question: "What is inheritance?",
    options: ['Deriving new classes from existing', 'Copying data', 'Encapsulation', 'None'], answer: 0 },
  { question: "What is a template?",
    options: ['Generic programming', 'A class', 'A function', 'None'], answer: 0 },
  { question: "What is the output of \`int x=5; int &y=x; y=10; cout<<x;\`?",
    options: ['10', '5', 'Error', '0'], answer: 0 },
  { question: "What is a copy constructor?",
    options: ['Constructor that initializes object from another', 'Default constructor', 'Destructor', 'None'], answer: 0 },
  { question: "Which of the following is true about \`new\` operator?",
    options: ['Allocates memory', 'Calls constructor', 'Returns pointer', 'All of the above'], answer: 3 },
  { question: "What is the difference between struct and class in C++?",
    options: ['Default access (public vs private)', 'No difference', 'Struct cannot have functions', 'None'], answer: 0 },
  { question: "What is an abstract class?",
    options: ['Has at least one pure virtual function', 'Cannot be instantiated', 'Both', 'None'], answer: 2 },
  { question: "What is the output of \`cout << 'A' + 1;\`?",
    options: ['B', '66', 'A1', 'Error'], answer: 1 },
  // Computer Architecture (25)
  { question: "What does CPU stand for?",
    options: ['Central Processing Unit', 'Computer Personal Unit', 'Central Program Unit', 'None'], answer: 0 },
  { question: "Which component stores data temporarily?",
    options: ['RAM', 'Hard disk', 'SSD', 'Cache'], answer: 0 },
  { question: "What is the function of ALU?",
    options: ['Arithmetic and logic operations', 'Control flow', 'Memory management', 'I/O'], answer: 0 },
  { question: "What is a register?",
    options: ['Small fast memory in CPU', 'Large slow memory', 'Disk storage', 'Cache'], answer: 0 },
  { question: "What does RISC stand for?",
    options: ['Reduced Instruction Set Computer', 'Reduced Integrated System Computer', 'Reduced Instruction Set Compiler', 'None'], answer: 0 },
  { question: "What is pipelining?",
    options: ['Overlapping instruction execution', 'Increasing clock speed', 'Adding more cores', 'None'], answer: 0 },
  { question: "Which bus carries data between CPU and memory?",
    options: ['Data bus', 'Address bus', 'Control bus', 'PCI bus'], answer: 0 },
  { question: "What is cache memory?",
    options: ['Small fast memory between CPU and RAM', 'Large slow memory', 'Virtual memory', 'None'], answer: 0 },
  { question: "What is the full form of DMA?",
    options: ['Direct Memory Access', 'Direct Memory Allocation', 'Data Memory Access', 'None'], answer: 0 },
  { question: "Which unit controls the execution of instructions?",
    options: ['Control Unit', 'ALU', 'Memory Unit', 'I/O'], answer: 0 },
  { question: "What is a clock cycle?",
    options: ['Time between two clock pulses', 'Instruction execution time', 'Memory access time', 'None'], answer: 0 },
  { question: "What is the function of MAR?",
    options: ['Holds memory address', 'Holds data', 'Holds instruction', 'None'], answer: 0 },
  { question: "What is MDR?",
    options: ['Memory Data Register', 'Memory Address Register', 'Memory Data Read', 'None'], answer: 0 },
  { question: "What does Harvard architecture have?",
    options: ['Separate data and instruction memory', 'Same memory for both', 'No memory', 'None'], answer: 0 },
  { question: "What is von Neumann architecture?",
    options: ['Single memory for data and instructions', 'Separate memory', 'No memory', 'None'], answer: 0 },
  { question: "What is an interrupt?",
    options: ['Signal to CPU from hardware', 'Software error', 'Memory fault', 'None'], answer: 0 },
  { question: "What is the role of program counter?",
    options: ['Holds next instruction address', 'Holds current instruction', 'Holds data', 'None'], answer: 0 },
  { question: "What is a bus?",
    options: ['Communication pathway', 'Memory unit', 'CPU core', 'None'], answer: 0 },
  { question: "What is the speed of cache compared to RAM?",
    options: ['Faster', 'Slower', 'Same', 'Depends'], answer: 0 },
  { question: "What does MIPS stand for?",
    options: ['Million Instructions Per Second', 'Microprocessor without Interlocked Pipeline Stages', 'Both', 'None'], answer: 2 },
  { question: "What is a multicore processor?",
    options: ['Multiple CPUs on one chip', 'Single CPU with multiple ALUs', 'Multiple chips', 'None'], answer: 0 },
  { question: "What is the purpose of virtual memory?",
    options: ['Extend memory using disk', 'Faster access', 'Cache management', 'None'], answer: 0 },
  { question: "What is a page fault?",
    options: ['When page not in memory', 'When page is in memory', 'Disk error', 'None'], answer: 0 },
  { question: "What is the role of TLB?",
    options: ['Cache for page table entries', 'Cache for data', 'Instruction cache', 'None'], answer: 0 },
  { question: "What is the width of a 32-bit processor?",
    options: ['32 bits', '64 bits', '16 bits', '8 bits'], answer: 0 },
  // OS Basics (25)
  { question: "What is an operating system?",
    options: ['Software that manages hardware', 'Application software', 'Firmware', 'None'], answer: 0 },
  { question: "Which of the following is an OS?",
    options: ['Windows', 'Linux', 'macOS', 'All of the above'], answer: 3 },
  { question: "What is a process?",
    options: ['Program in execution', 'Program on disk', 'Thread', 'None'], answer: 0 },
  { question: "What is a thread?",
    options: ['Lightweight process', 'Part of a process', 'Both', 'None'], answer: 2 },
  { question: "What is scheduling?",
    options: ['Deciding which process runs next', 'Memory allocation', 'I/O management', 'None'], answer: 0 },
  { question: "What is the purpose of a system call?",
    options: ['Request service from OS', 'Call a function', 'Interrupt', 'None'], answer: 0 },
  { question: "What is deadlock?",
    options: ['Processes waiting indefinitely', 'No memory', 'CPU failure', 'None'], answer: 0 },
  { question: "Which of the following is a deadlock condition?",
    options: ['Mutual exclusion', 'Hold and wait', 'No preemption', 'All of the above'], answer: 3 },
  { question: "What is virtual memory?",
    options: ['Memory management technique', 'Physical memory', 'Disk space', 'None'], answer: 0 },
  { question: "What is paging?",
    options: ['Dividing memory into fixed pages', 'Dividing into variable segments', 'Memory allocation', 'None'], answer: 0 },
  { question: "What is fragmentation?",
    options: ['Wasted memory', 'Used memory', 'Free memory', 'None'], answer: 0 },
  { question: "What is the role of a file system?",
    options: ['Manage files on disk', 'Manage processes', 'Manage memory', 'None'], answer: 0 },
  { question: "What is a directory?",
    options: ['Collection of files', 'File type', 'System file', 'None'], answer: 0 },
  { question: "What is the difference between multitasking and multiprocessing?",
    options: ['Multiple tasks vs multiple CPUs', 'Same', 'None'], answer: 0 },
  { question: "What is a semaphore?",
    options: ['Synchronization tool', 'Memory unit', 'Process', 'None'], answer: 0 },
  { question: "What is a mutex?",
    options: ['Mutual exclusion lock', 'Semaphore', 'Process', 'None'], answer: 0 },
  { question: "What is the kernel?",
    options: ['Core of OS', 'Shell', 'Application', 'None'], answer: 0 },
  { question: "What is the difference between user mode and kernel mode?",
    options: ['Privilege level', 'Memory access', 'Both', 'None'], answer: 2 },
  { question: "What is a system call interface?",
    options: ['API to kernel', 'User program', 'Library', 'None'], answer: 0 },
  { question: "What is IPC?",
    options: ['Inter-Process Communication', 'Internal Process Control', 'Instruction Pointer Counter', 'None'], answer: 0 },
  { question: "Which of the following is an IPC mechanism?",
    options: ['Pipe', 'Message queue', 'Shared memory', 'All of the above'], answer: 3 },
  { question: "What is a zombie process?",
    options: ['Terminated but entry remains', 'Running', 'Sleeping', 'None'], answer: 0 },
  { question: "What is a fork?",
    options: ['Creating a new process', 'Copying memory', 'System call', 'Both A and C'], answer: 3 },
  { question: "What is the role of a scheduler?",
    options: ['Select process to run', 'Allocate memory', 'Manage I/O', 'None'], answer: 0 },
  { question: "What is the difference between preemptive and non-preemptive scheduling?",
    options: ['Forced vs voluntary CPU release', 'Priority vs no priority', 'None'], answer: 0 }
];

// Get 20 random questions with their bank indices
app.get('/api/questions/random', (req, res) => {
  // Shuffle a copy of the bank
  const shuffled = [...questionBank];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const selected = shuffled.slice(0, 20);
  // Find original indices (assuming all questions are unique)
  const indices = selected.map(q => questionBank.indexOf(q));
  const questions = selected.map((q, idx) => ({
    id: idx + 1,
    question: q.question,
    options: q.options
  }));
  res.json({ questions, indices });
});

// // Submit test (for application)
// app.post('/api/submit-test', (req, res) => {
//    const { email, answers, indices, jobId } = req.body;   // <-- add jobId
  
//   if (!email || !answers || !indices|| !jobId) {
//     return res.status(400).json({ error: 'Email, answers, indices and jobId are required' });
//   }

//   try {
//     let score = 0;
//     answers.forEach(ans => {
//       const bankIndex = indices[ans.qid - 1];
//       const q = questionBank[bankIndex];
//       if (q && q.answer === ans.answer) score++;
//     });

//     // Store result in tests/results.xlsx
//     const filePath = 'data/tests/results.xlsx';
//     const wb = XLSX.readFile(filePath);
//     const ws = wb.Sheets['Sheet1'];
//     const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
//     data.push([email, score, 20, JSON.stringify(answers), new Date().toISOString()]);
//     const newWs = XLSX.utils.aoa_to_sheet(data);
//     wb.Sheets['Sheet1'] = newWs;
//     XLSX.writeFile(wb, filePath);

//     // Also update the application record with test score
//     const appPath = 'data/applications/applications.xlsx';
//     const appWb = XLSX.readFile(appPath);
//     const appWs = appWb.Sheets['Sheet1'];
//     const apps = XLSX.utils.sheet_to_json(appWs, { header: 1 });
//     let rowIndex = -1;
//     for (let i = apps.length - 1; i >= 0; i--) {
//       if (apps[i][1] === email && apps[i][10] === jobId) {
//         rowIndex = i;
//         break;
//       }
//     }

//     if (rowIndex === -1) {
//   return res.status(404).json({ error: 'Application not found for this job' });
// }

// // NEW: Check if test already taken
// if (apps[rowIndex][8] && apps[rowIndex][8] !== '') {
//   return res.status(400).json({ error: 'You have already taken the test for this job' });
// }

//     // if (rowIndex !== -1) {
//     //   apps[rowIndex][8] = score; // TestScore
//     //   apps[rowIndex][9] = JSON.stringify(answers); // TestAnswers
//     //   const newAppWs = XLSX.utils.aoa_to_sheet(apps);
//     //   appWb.Sheets['Sheet1'] = newAppWs;
//     //   XLSX.writeFile(appWb, appPath);
//     // }

//     res.json({ success: true, score, total: 20 });
//   } catch (err) {
//     console.error('Test submission error:', err);
//     res.status(500).json({ error: 'Server error: ' + err.message });
//   }
// });


app.post('/api/submit-test', async (req, res) => {
  const { email, answers, indices, jobId } = req.body;

  if (!email || !answers || !indices || !jobId) {
    return res.status(400).json({ error: 'Email, answers, indices and jobId are required' });
  }

  const trimmedEmail = email.trim();

  try {
    // Calculate score
    let score = 0;
    answers.forEach(ans => {
      const bankIndex = indices[ans.qid - 1];
      const q = questionBank[bankIndex];
      if (q && q.answer === ans.answer) score++;
    });

    // Save to results.xlsx
    const filePath = 'data/tests/results.xlsx';
    const wb = XLSX.readFile(filePath);
    const ws = wb.Sheets['Sheet1'];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
    data.push([trimmedEmail, score, 20, JSON.stringify(answers), new Date().toISOString()]);
    const newWs = XLSX.utils.aoa_to_sheet(data);
    wb.Sheets['Sheet1'] = newWs;
    XLSX.writeFile(wb, filePath);
    // After saving results.xlsx
await uploadExcelToDrive('data/tests/results.xlsx', 'results.xlsx', true);

    // Update the application record with test score
    const appPath = 'data/applications/applications.xlsx';
    const appWb = XLSX.readFile(appPath);
    const appWs = appWb.Sheets['Sheet1'];
    const appRows = XLSX.utils.sheet_to_json(appWs, { header: 1 });

    if (appRows.length === 0) {
      return res.status(500).json({ error: 'Applications file empty' });
    }

    const headers = appRows[0];
    const dataRows = appRows.slice(1);

    // Find column indices
const emailIdx = headers.indexOf('Email');
const jobIdIdx = headers.indexOf('JobCode');        // was JobCode
const testScoreIdx = headers.indexOf('TestScore');
const testAnswersIdx = headers.indexOf('TestAnswers');

if (emailIdx === -1 || jobIdIdx === -1 || testScoreIdx === -1 || testAnswersIdx === -1) {
  console.error('Required columns not found in applications.xlsx');
  return res.status(500).json({ error: 'Data structure error' });
}

    // Find the row with matching email AND jobId
    let rowIndex = -1;
    for (let i = dataRows.length - 1; i >= 0; i--) {
      const rowEmail = dataRows[i][emailIdx] ? dataRows[i][emailIdx].toString().trim() : '';
     const rowJobId = dataRows[i][jobIdIdx] ? dataRows[i][jobIdIdx].toString() : '';
if (rowEmail === trimmedEmail && rowJobId === jobId) {
  rowIndex = i;
  break;
}
    }

    if (rowIndex === -1) {
      return res.status(404).json({ error: 'Application not found for this job' });
    }

    // Check if test already taken
    if (dataRows[rowIndex][testScoreIdx] && dataRows[rowIndex][testScoreIdx] !== '') {
      return res.status(400).json({ error: 'You have already taken the test for this job' });
    }

    // Update the row
    dataRows[rowIndex][testScoreIdx] = score;
    dataRows[rowIndex][testAnswersIdx] = JSON.stringify(answers);

    // Reconstruct the sheet
    const newAppRows = [headers, ...dataRows];
    const newAppWs = XLSX.utils.aoa_to_sheet(newAppRows);
    appWb.Sheets['Sheet1'] = newAppWs;
    XLSX.writeFile(appWb, appPath);
    // After updating applications.xlsx
await uploadExcelToDrive('data/applications/applications.xlsx', 'applications.xlsx', true);

    console.log(`Test submitted for ${trimmedEmail}, job ${jobId}, score ${score}`);
    res.json({ success: true, score, total: 20 });
  } catch (err) {
    console.error('Test submission error:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// Get user activity (applications)
app.get('/api/user/activity', (req, res) => {
  const { email } = req.query;
  if (!email) {
    return res.status(400).json({ error: 'Email required' });
  }

  try {
    const appPath = 'data/applications/applications.xlsx';
    if (!fs.existsSync(appPath)) {
      return res.json({ applications: [] });
    }

    const wb = XLSX.readFile(appPath);
    const ws = wb.Sheets['Sheet1'];
    const apps = XLSX.utils.sheet_to_json(ws, { header: 1 });

    // apps[0] is header row; skip it
    const applications = [];
    for (let i = 1; i < apps.length; i++) {
      const row = apps[i];
      if (row[1] === email) { // email is at index 1
        let appliedAt = row[12];

        
    // If it's a number, assume it's an Excel serial date and convert
    if (typeof appliedAt === 'number') {
      // Excel serial date to JS Date: subtract 25569 (days between 1900-01-01 and 1970-01-01)
      const jsDate = new Date((appliedAt - 25569) * 86400 * 1000);
      appliedAt = jsDate.toISOString();
    }


        applications.push({
          Name: row[0],
          Email: row[1],
          ResumePath: row[2],
          AudioPath: row[3],
          PhotoPath: row[4],
          Office: row[5],
          Lat: row[6],
          Lon: row[7],
          TestScore: row[8],
          TestAnswers: row[9],
          JobId: row[11],
          AppliedAt: appliedAt
        });
      }
    }

    res.json({ applications });
  } catch (err) {
    console.error('Activity error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ==================== CONTACT SALES ====================
// Initialize contact sales Excel file
const contactsDir = 'data/contacts';
if (!fs.existsSync(contactsDir)) fs.mkdirSync(contactsDir, { recursive: true });
initExcel('data/contacts/contacts.xlsx', ['Name', 'Company', 'Email', 'Phone', 'Message', 'SubmittedAt']);

app.post('/api/contact-sales', async (req, res) => {
  const { name, company, email, phone, message } = req.body;
  if (!name || !company || !email || !message) {
    return res.status(400).json({ error: 'Name, company, email and message are required' });
  }

  try {
    const filePath = 'data/contacts/contacts.xlsx';
    const wb = XLSX.readFile(filePath);
    const ws = wb.Sheets['Sheet1'];
    const contacts = XLSX.utils.sheet_to_json(ws, { header: 1 });

    contacts.push([name, company, email, phone || '', message, new Date().toISOString()]);

    const newWs = XLSX.utils.aoa_to_sheet(contacts);
    wb.Sheets['Sheet1'] = newWs;
    XLSX.writeFile(wb, filePath);
    await uploadExcelToDrive('data/contacts/contacts.xlsx', 'contacts.xlsx', true);

    res.json({ success: true, message: 'Inquiry received' });
  } catch (err) {
    console.error('Contact sales error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});



app.post('/api/forgot-password', async (req, res) => {
  const { identifier } = req.body;
  if (!identifier) {
    return res.status(400).json({ error: 'Email or mobile is required' });
  }

  try {
    // Find user in accounts.xlsx
    const filePath = 'data/users/accounts.xlsx';
    const wb = XLSX.readFile(filePath);
    const ws = wb.Sheets['Sheet1'];
    const accounts = XLSX.utils.sheet_to_json(ws);

    const user = accounts.find(a => a.Mobile === identifier || a.Email === identifier);
    if (!user) {
      return res.status(404).json({ error: 'No account found with that email/mobile' });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = Date.now() + 10 * 60 * 1000; // 10 minutes

    // Store OTP
    otpStore.set(identifier, { otp, expires });

    // Send email
    const mailOptions = {
      from: `"QuantEdge" <${process.env.EMAIL_USER}>`,
      to: user.Email,
      subject: 'Password Reset OTP',
      text: `Your OTP for password reset is: ${otp}. It is valid for 10 minutes.`,
      html: `<p>Your OTP for password reset is: <strong>${otp}</strong></p><p>This code expires in 10 minutes.</p>`
    };

    await transporter.sendMail(mailOptions);

    res.json({ success: true, message: 'OTP sent to your email' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Failed to send OTP. Please try again.' });
  }
});



app.post('/api/verify-otp', async (req, res) => {
  const { identifier, otp, newPassword } = req.body;
  if (!identifier || !otp || !newPassword) {
    return res.status(400).json({ error: 'Identifier, OTP, and new password are required' });
  }

  try {
    // Check OTP
    const record = otpStore.get(identifier);
    if (!record) {
      return res.status(400).json({ error: 'No OTP found. Please request a new one.' });
    }
    if (Date.now() > record.expires) {
      otpStore.delete(identifier);
      return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
    }
    if (record.otp !== otp) {
      return res.status(400).json({ error: 'Invalid OTP' });
    }

    // Update password in accounts.xlsx
    const filePath = 'data/users/accounts.xlsx';
    const wb = XLSX.readFile(filePath);
    const ws = wb.Sheets['Sheet1'];
    const accounts = XLSX.utils.sheet_to_json(ws, { header: 1 });

    // Find the row (skip header row)
    let rowIndex = -1;
    for (let i = 1; i < accounts.length; i++) {
      const row = accounts[i];
      if (row[4] === identifier || row[3] === identifier) { // row[4]=Email, row[3]=Mobile
        rowIndex = i;
        break;
      }
    }

    if (rowIndex === -1) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Hash new password
    const hash = await bcrypt.hash(newPassword, 10);
    accounts[rowIndex][5] = hash; // PasswordHash column (index 5)

    const newWs = XLSX.utils.aoa_to_sheet(accounts);
    wb.Sheets['Sheet1'] = newWs;
    XLSX.writeFile(wb, filePath);
    await uploadExcelToDrive('data/users/accounts.xlsx', 'accounts.xlsx', true);

    // Remove OTP from store
    otpStore.delete(identifier);

    res.json({ success: true, message: 'Password reset successfully' });
  } catch (err) {
    console.error('Verify OTP error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * Uploads an Excel file to the 'ExcelData' Drive folder.
 * @param {string} localPath - Full path to the local Excel file.
 * @param {string} driveFileName - Name to give the file in Drive.
 * @param {boolean} overwrite - If true, replaces an existing file with the same name.
 */
async function uploadExcelToDrive(localPath, driveFileName, overwrite = true) {
  try {
    if (!fs.existsSync(localPath)) {
      console.warn(`Excel file not found, skipping upload: ${localPath}`);
      return;
    }

    if (overwrite) {
      // 1. Look for an existing file with the same name in the ExcelData folder
      const response = await drive.files.list({
        q: `name='${driveFileName}' and '${driveFolderIds.excelData}' in parents and trashed=false`,
        fields: 'files(id, name)',
        spaces: 'drive',
      });

      if (response.data.files.length > 0) {
        const fileId = response.data.files[0].id;
        // 2. Update the existing file
        const media = { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', body: fs.createReadStream(localPath) };
        await drive.files.update({ fileId, media });
        console.log(`✅ Updated existing Drive file: ${driveFileName}`);
        return;
      }
    }

    // No existing file (or overwrite=false) – upload a new one
    const result = await uploadFile(
      localPath,
      overwrite ? driveFileName : `${Date.now()}_${driveFileName}`, // add timestamp if versioning
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      driveFolderIds.excelData
    );
    console.log(`✅ Uploaded ${driveFileName} to Drive (ID: ${result.id})`);
  } catch (err) {
    console.error(`❌ Failed to upload ${driveFileName} to Drive:`, err.message);
    // Don't throw – we don't want a Drive failure to break the main flow
  }
}







// Start server
app.listen(PORT, async() => {
  console.log(`Server running on http://localhost:${PORT}`);
  await initializeDriveFolders();
});

