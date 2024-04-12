import express, { type Request, type Response } from 'express';
import fileUpload, { type UploadedFile, type FileArray } from 'express-fileupload';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';

const app = express();
app.use(fileUpload());
app.use(express.static('public'));

interface FileDataResult {
  originalname: string;
  filename: string;
  type: string;
}


function handleFiles(file: UploadedFile | UploadedFile[]): FileDataResult[] {
  const files: UploadedFile[] = Array.isArray(file) ? file : [file];
  const response: FileDataResult[] = [];
  files.forEach((file) => {
    const { name, data, mimetype } = file;
    const hash = crypto.createHash('sha256').update(data).digest('hex');
    const fileData: FileDataResult = {
      originalname: name,
      filename: hash,
      type: mimetype,
    };

    file.mv(path.join(__dirname, '../uploads', hash), (err) => {
      if (err) {
        console.error(err);
        return;
      }
    });
    console.log('fileData', fileData);
    response.push(fileData);
  });

  return response;
}

app.post('/upload', (req: Request, res: Response) => {

  if (!req.files) {
    return res.status(400).json({ msg: 'No file uploaded' });
  }

  const response: FileDataResult[] = [];
  Object.entries(req.files).forEach(([key, file]) => {
    response.push(...handleFiles(file));
  });
  res.send({response});

});

app.listen(3000, () => {
  console.log('Server is running on port http://localhost:3000');
});