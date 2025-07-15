import multer from 'multer';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import mime from 'mime-types';
import crypto from 'crypto';

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(process.cwd(), 'server', 'uploads');
const IMAGES_DIR = path.join(UPLOADS_DIR, 'images');
const FILES_DIR = path.join(UPLOADS_DIR, 'files');

async function ensureDirectories() {
  try {
    if (!existsSync(UPLOADS_DIR)) {
      await fs.mkdir(UPLOADS_DIR, { recursive: true });
    }
    if (!existsSync(IMAGES_DIR)) {
      await fs.mkdir(IMAGES_DIR, { recursive: true });
    }
    if (!existsSync(FILES_DIR)) {
      await fs.mkdir(FILES_DIR, { recursive: true });
    }
  } catch (error) {
    console.error('Error creating upload directories:', error);
  }
}

// Initialize directories
ensureDirectories();

// File type validation
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_FILE_TYPES = [
  ...ALLOWED_IMAGE_TYPES,
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
  'application/x-zip-compressed'
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

// Generate unique filename
function generateUniqueFilename(originalName: string): string {
  const timestamp = Date.now();
  const randomBytes = crypto.randomBytes(8).toString('hex');
  const extension = path.extname(originalName);
  const baseName = path.basename(originalName, extension)
    .replace(/[^a-zA-Z0-9\-_]/g, '')
    .substring(0, 50);
  
  return `${timestamp}-${randomBytes}-${baseName}${extension}`;
}

// Check if file is an image
function isImage(mimetype: string): boolean {
  return ALLOWED_IMAGE_TYPES.includes(mimetype);
}

// File filter function
function fileFilter(req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  if (!ALLOWED_FILE_TYPES.includes(file.mimetype)) {
    return cb(new Error(`File type ${file.mimetype} is not allowed`));
  }
  
  cb(null, true);
}

// Configure multer storage
const storage = multer.memoryStorage();

// Create multer instance
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 5 // Maximum 5 files per request
  }
});

// Process and save uploaded file
export async function processUploadedFile(file: Express.Multer.File, teamId?: string): Promise<{
  filename: string;
  originalName: string;
  size: number;
  mimetype: string;
  url: string;
  path: string;
  teamId?: string;
}> {
  const uniqueFilename = generateUniqueFilename(file.originalname);
  
  if (isImage(file.mimetype)) {
    // Process image with sharp
    const processedImagePath = path.join(IMAGES_DIR, uniqueFilename);
    
    await sharp(file.buffer)
      .resize(1920, 1080, { 
        fit: 'inside',
        withoutEnlargement: true 
      })
      .jpeg({ quality: 85, progressive: true })
      .png({ quality: 85, progressive: true })
      .webp({ quality: 85 })
      .toFile(processedImagePath);

    // Get file stats
    const stats = await fs.stat(processedImagePath);
    
    return {
      filename: uniqueFilename,
      originalName: file.originalname,
      size: stats.size,
      mimetype: file.mimetype,
      url: `/papyr-us/api/uploads/images/${uniqueFilename}`,
      path: processedImagePath,
      teamId
    };
  } else {
    // Save regular file
    const filePath = path.join(FILES_DIR, uniqueFilename);
    await fs.writeFile(filePath, file.buffer);
    
    return {
      filename: uniqueFilename,
      originalName: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
      url: `/papyr-us/api/uploads/files/${uniqueFilename}`,
      path: filePath,
      teamId
    };
  }
}

// Delete uploaded file
export async function deleteUploadedFile(filename: string, isImage: boolean = false): Promise<boolean> {
  try {
    const filePath = isImage 
      ? path.join(IMAGES_DIR, filename)
      : path.join(FILES_DIR, filename);
    
    if (existsSync(filePath)) {
      await fs.unlink(filePath);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error deleting file:', error);
    return false;
  }
}

// Get file info
export async function getFileInfo(filename: string, isImage: boolean = false) {
  try {
    const filePath = isImage 
      ? path.join(IMAGES_DIR, filename)
      : path.join(FILES_DIR, filename);
    
    if (!existsSync(filePath)) {
      return null;
    }
    
    const stats = await fs.stat(filePath);
    const mimeType = mime.lookup(filePath) || 'application/octet-stream';
    
    return {
      filename,
      size: stats.size,
      mimetype: mimeType,
      created: stats.birthtime,
      modified: stats.mtime,
      path: filePath
    };
  } catch (error) {
    console.error('Error getting file info:', error);
    return null;
  }
}

// List uploaded files
export async function listUploadedFiles(teamId?: string): Promise<{
  images: any[];
  files: any[];
}> {
  try {
    const [imageFiles, regularFiles] = await Promise.all([
      fs.readdir(IMAGES_DIR).catch(() => []),
      fs.readdir(FILES_DIR).catch(() => [])
    ]);

    const images = await Promise.all(
      imageFiles
        .filter(file => file !== '.gitkeep')
        .map(async (filename) => {
          const info = await getFileInfo(filename, true);
          return info ? { ...info, url: `/papyr-us/api/uploads/images/${filename}` } : null;
        })
    );

    const files = await Promise.all(
      regularFiles
        .filter(file => file !== '.gitkeep')
        .map(async (filename) => {
          const info = await getFileInfo(filename, false);
          return info ? { ...info, url: `/papyr-us/api/uploads/files/${filename}` } : null;
        })
    );

    return {
      images: images.filter(Boolean),
      files: files.filter(Boolean)
    };
  } catch (error) {
    console.error('Error listing files:', error);
    return { images: [], files: [] };
  }
}

// Clean up old files (optional - can be called periodically)
export async function cleanupOldFiles(daysOld: number = 30): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);
  
  let deletedCount = 0;
  
  try {
    const directories = [IMAGES_DIR, FILES_DIR];
    
    for (const dir of directories) {
      const files = await fs.readdir(dir).catch(() => []);
      
      for (const filename of files) {
        if (filename === '.gitkeep') continue;
        
        const filePath = path.join(dir, filename);
        const stats = await fs.stat(filePath);
        
        if (stats.birthtime < cutoffDate) {
          await fs.unlink(filePath);
          deletedCount++;
        }
      }
    }
    
    console.log(`Cleanup completed: deleted ${deletedCount} old files`);
    return deletedCount;
  } catch (error) {
    console.error('Error during cleanup:', error);
    return 0;
  }
} 