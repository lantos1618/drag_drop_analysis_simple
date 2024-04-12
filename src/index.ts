import express, { type Request, type Response } from 'express';
import fileUpload, { type UploadedFile, type FileArray } from 'express-fileupload';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import { PDFExtract, type PDFExtractOptions } from 'pdf.js-extract';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();


const API_KEY = process.env.OPEN_AI_API_KEY;
if (!API_KEY) {
  throw new Error('No OpenAI API key provided. Set OPEN_AI_API_KEY in the environment.');
}


const IMAGE_MIMETYPE = ['image/jpeg', 'image/png', 'image/gif', 'image/bmp'];
const PDF_MIMETYPE = ['application/pdf'];
const TEXT_MIMETYPE = [
  'text/plain', 'application/json', 'application/xml', 'application/csv',
  'application/octet-stream', 'application/x-yaml', 'application/x-yml',
  'application/javascript', 'application/typescript', 'application/html',
  '.js', '.ts', '.html', '.css', '.scss', '.json', '.xml', '.csv', '.txt',
  '.md', '.yml', '.yaml', '.env', '.env.local', '.env.development', '.env.test', '.env.production', '.env.staging'
];


const app = express();
app.use(fileUpload());
app.use(express.static('public'));
app.use(express.json());



interface FileDataResult {
  originalname: string;
  hash: string;
  mimetype: string;
}


const pdfExtract = new PDFExtract();
const options: PDFExtractOptions = {}; // Options can be configured as needed

app.post("/analyze", async (req: Request, res: Response) => {

  const { hash, mimetype } = req.body;
  console.log(hash, mimetype, req.body);

  if (!hash) {
    return res.status(400).json({ msg: 'No hash provided' });
  }

  if (!mimetype) {
    return res.status(400).json({ msg: 'No mimetype provided' });
  }


  const client = new OpenAI({ apiKey: API_KEY });
  try {

    if (IMAGE_MIMETYPE.includes(mimetype)) {
      let response = await analyzeImage(hash, client);
      let choice = response.choices[0].message.content;
      return res.json({ analysis: choice });
    }

    if (PDF_MIMETYPE.includes(mimetype)) {
      const pdfPath = path.join(__dirname, '../uploads', hash);
      try {
        let response = await analyzePDF(pdfPath);
        let choice = response.choices[0].message.content;
        return res.json({ analysis: choice });
      } catch (err) {
        return res.status(500).json({ msg: 'Failed to process PDF file' });
      }
    }

    if (TEXT_MIMETYPE.includes(mimetype)) {
      let response = await analyzeText();
      let choice = response.choices[0].message.content;
      return res.json({ analysis: choice });
    }

  } catch (err) {
    console.error('Error analyzing file:', err);
    return res.status(500).json({ msg: 'Failed to analyze file' });
  }

  return res.status(400).json({ msg: 'File type not supported for analysis' });

  async function analyzeText() {
    const textPath = path.join(__dirname, '../uploads', hash);
    const text = fs.readFileSync(textPath, 'utf8');

    let response = await client.chat.completions.create({
      model: 'gpt-4-turbo',
      messages: [
        {
          role: 'system',
          content: 'Please analyze the text:',
        },
        {
          role: 'user',
          content: text
        },
      ],
    });
    return response;
  }

  async function analyzePDF(pdfPath: string) {
    const data = await pdfExtract.extract(pdfPath, options);
    const textContent = data.pages.map(page => page.content.map(line => line.str).join(' ')).join('\n');

    let response = await client.chat.completions.create({
      model: 'gpt-4-turbo',
      messages: [
        {
          role: 'system',
          content: 'Please summarize the following document:',
        },
        {
          role: 'user',
          content: textContent
        },
      ],
    });
    return response;
  }
});


async function analyzeImage(hash: any, client: OpenAI) {
  const imagePath = path.join(__dirname, '../uploads', hash);
  const image = fs.readFileSync(imagePath);
  const base64Image = Buffer.from(image).toString('base64');

  let response = await client.chat.completions.create({
    model: 'gpt-4-turbo',
    messages: [
      {
        role: 'system',
        content: 'What is the image about?',
      },
      {
        role: 'user',
        content: `data:image/jpeg;base64,${base64Image}`
      },
    ],
  });

  return response;

}

function handleFiles(file: UploadedFile | UploadedFile[]): FileDataResult[] {
  const files: UploadedFile[] = Array.isArray(file) ? file : [file];
  const response: FileDataResult[] = [];
  files.forEach((file) => {
    const { name, data, mimetype } = file;
    const hash = crypto.createHash('sha256').update(data).digest('hex');
    const fileData: FileDataResult = {
      originalname: name,
      hash: hash,
      mimetype: mimetype,
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
  res.send({ data: response });

});

app.listen(3000, () => {
  console.log('Server is running on port http://localhost:3000');
});