#!/usr/bin/env tsx
/**
 * Download Face API Models
 * Downloads the required models for face-api.js
 */

import https from 'https';
import fs from 'fs';
import path from 'path';

const MODELS_DIR = path.join(process.cwd(), 'models');

const MODELS = [
    {
        name: 'ssd_mobilenetv1_model-weights_manifest.json',
        url: 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/ssd_mobilenetv1_model-weights_manifest.json'
    },
    {
        name: 'ssd_mobilenetv1_model-shard1',
        url: 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/ssd_mobilenetv1_model-shard1'
    },
    {
        name: 'ssd_mobilenetv1_model-shard2',
        url: 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/ssd_mobilenetv1_model-shard2'
    },
    {
        name: 'face_landmark_68_model-weights_manifest.json',
        url: 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/face_landmark_68_model-weights_manifest.json'
    },
    {
        name: 'face_landmark_68_model-shard1',
        url: 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/face_landmark_68_model-shard1'
    },
    {
        name: 'face_recognition_model-weights_manifest.json',
        url: 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/face_recognition_model-weights_manifest.json'
    },
    {
        name: 'face_recognition_model-shard1',
        url: 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/face_recognition_model-shard1'
    },
    {
        name: 'face_recognition_model-shard2',
        url: 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/face_recognition_model-shard2'
    }
];

function downloadFile(url: string, dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download ${url}: ${response.statusCode}`));
                return;
            }

            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => {});
            reject(err);
        });
    });
}

async function downloadModels() {
    console.log('📥 Downloading face-api.js models...\n');

    // Ensure models directory exists
    if (!fs.existsSync(MODELS_DIR)) {
        fs.mkdirSync(MODELS_DIR, { recursive: true });
    }

    for (const model of MODELS) {
        const destPath = path.join(MODELS_DIR, model.name);
        console.log(`Downloading ${model.name}...`);

        try {
            await downloadFile(model.url, destPath);
            console.log(`✅ ${model.name} downloaded`);
        } catch (error) {
            console.error(`❌ Failed to download ${model.name}:`, error);
        }
    }

    console.log('\n✅ Model download completed!');
    console.log('📁 Models saved to:', MODELS_DIR);
}

// Run if called directly
if (require.main === module) {
    downloadModels().catch(console.error);
}

export { downloadModels };