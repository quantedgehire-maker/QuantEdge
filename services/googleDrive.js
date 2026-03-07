// const { google } = require('googleapis');
// const fs = require('fs');
// const path = require('path');

// // Initialize authentication with service account
// const auth = new google.auth.GoogleAuth({
//   keyFile: path.join(__dirname, '../google-credentials.json'),
//   scopes: ['https://www.googleapis.com/auth/drive.file'], // Scope for file uploads
// });

// const drive = google.drive({ version: 'v3', auth });

// /*
//  * Creates a folder in Google Drive if it doesn't exist
//  * @param {string} folderName - Name of the folder to create
//  * @param {string} parentFolderId - ID of parent folder (optional)
//  * @param {string} shareWithEmail - Email to share the folder with (optional)
//  * @returns {Promise<string>} - Folder ID
//  */
// async function createFolder(folderName, parentFolderId = null, shareWithEmail = null) {
//   try {
//     let query = `name='${folderName}' and mimeType='application/vnd.google-apps.folder'`;
//     if (parentFolderId) {
//       query += ` and '${parentFolderId}' in parents`;
//     }

//     const response = await drive.files.list({
//       q: query,
//       fields: 'files(id, name)',
//       spaces: 'drive'
//     });

//     let folderId;

//     if (response.data.files.length > 0) {
//       folderId = response.data.files[0].id;
//       console.log(`📁 Folder "${folderName}" already exists (ID: ${folderId})`);
//     } else {
//       const fileMetadata = {
//         name: folderName,
//         mimeType: 'application/vnd.google-apps.folder',
//       };
//       if (parentFolderId) {
//         fileMetadata.parents = [parentFolderId];
//       }

//       const folder = await drive.files.create({
//         resource: fileMetadata,
//         fields: 'id'
//       });
//       folderId = folder.data.id;
//       console.log(`✅ Created folder "${folderName}" (ID: ${folderId})`);
//     }

//     // Always attempt to share with the specified email (if provided)
//     if (shareWithEmail) {
//       try {
//         // Check if already shared
//         const permissions = await drive.permissions.list({
//           fileId: folderId,
//           fields: 'permissions(emailAddress, role)'
//         });
//         const alreadyShared = permissions.data.permissions.some(
//           p => p.emailAddress === shareWithEmail
//         );

//         if (!alreadyShared) {
//           await drive.permissions.create({
//             fileId: folderId,
//             requestBody: {
//               role: 'writer',
//               type: 'user',
//               emailAddress: shareWithEmail
//             }
//           });
//           console.log(`🔗 Shared folder "${folderName}" with ${shareWithEmail}`);
//         } else {
//           console.log(`🔗 Folder "${folderName}" already shared with ${shareWithEmail}`);
//         }
//       } catch (permErr) {
//         console.error(`❌ Failed to share folder "${folderName}" with ${shareWithEmail}:`, permErr.message);
//       }
//     }

//     return folderId;
//   } catch (error) {
//     console.error('Error creating folder:', error);
//     throw error;
//   }
// }

// /*
//  * Uploads a file to Google Drive
//  * @param {string} filePath - Local path to the file
//  * @param {string} fileName - Name for the file in Drive
//  * @param {string} mimeType - MIME type of the file
//  * @param {string} folderId - Destination folder ID
//  * @returns {Promise<object>} - Uploaded file metadata
//  */
// async function uploadFile(filePath, fileName, mimeType, folderId) {
//   try {
//     const fileMetadata = {
//       name: fileName,
//       parents: [folderId]
//     };

//     const media = {
//       mimeType: mimeType,
//       body: fs.createReadStream(filePath)
//     };

//     const response = await drive.files.create({
//       resource: fileMetadata,
//       media: media,
//       fields: 'id, name, webViewLink'
//     });

//     // Make file publicly accessible (optional)
//     await drive.permissions.create({
//       fileId: response.data.id,
//       requestBody: {
//         role: 'reader',
//         type: 'anyone'
//       }
//     });

//     return response.data;
//   } catch (error) {
//     console.error('Error uploading file:', error);
//     throw error;
//   }
// }

// /*
//  * Ensures the complete folder structure exists and returns folder ID
//  * @param {string[]} folderPath - Array of folder names (e.g., ['QuantEdge', 'Resumes'])
//  * @param {string} shareWithEmail - Email to share each folder with (optional)
//  * @returns {Promise<string>} - ID of the deepest folder
//  */
// async function ensureFolderStructure(folderPath, shareWithEmail = null) {
//   let parentId = null;
//   for (const folderName of folderPath) {
//     parentId = await createFolder(folderName, parentId, shareWithEmail);
//   }
//   return parentId;
// }

// module.exports = {
//   uploadFile,
//   createFolder,
//   ensureFolderStructure
// };

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// OAuth2 credentials
const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  'http://localhost:3000' // redirect URI – not used after token exchange
);

oauth2Client.setCredentials({
  refresh_token: REFRESH_TOKEN,
});

const drive = google.drive({ version: 'v3', auth: oauth2Client });

/**
 * Creates a folder (or returns existing) in YOUR Drive.
 * @param {string} folderName
 * @param {string} parentFolderId
 * @returns {Promise<string>} folder ID
 */
async function createFolder(folderName, parentFolderId = null) {
  try {
    let query = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    if (parentFolderId) {
      query += ` and '${parentFolderId}' in parents`;
    }

    const response = await drive.files.list({
      q: query,
      fields: 'files(id, name)',
      spaces: 'drive',
    });

    if (response.data.files.length > 0) {
      console.log(`📁 Folder "${folderName}" already exists (ID: ${response.data.files[0].id})`);
      return response.data.files[0].id;
    }

    const fileMetadata = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    };
    if (parentFolderId) {
      fileMetadata.parents = [parentFolderId];
    }

    const folder = await drive.files.create({
      resource: fileMetadata,
      fields: 'id',
    });

    console.log(`✅ Created folder "${folderName}" (ID: ${folder.data.id})`);
    return folder.data.id;
  } catch (error) {
    console.error('Error creating folder:', error);
    throw error;
  }
}

/**
 * Uploads a file to your Drive.
 */
async function uploadFile(filePath, fileName, mimeType, folderId) {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Local file not found: ${filePath}`);
    }

    const fileMetadata = {
      name: fileName,
      parents: [folderId],
    };

    const media = {
      mimeType: mimeType,
      body: fs.createReadStream(filePath),
    };

    const response = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id, name, webViewLink',
    });

    // Optional: make file publicly readable
    await drive.permissions.create({
      fileId: response.data.id,
      requestBody: { role: 'reader', type: 'anyone' },
    });

    return response.data;
  } catch (error) {
    console.error('Error uploading file:', error);
    throw error;
  }
}

/**
 * Ensures a folder path exists.
 */
async function ensureFolderStructure(folderPath) {
  let parentId = null;
  for (const folderName of folderPath) {
    parentId = await createFolder(folderName, parentId);
  }
  return parentId;
}

module.exports = {
  uploadFile,
  createFolder,
  ensureFolderStructure,
  drive,     // <-- add this
};