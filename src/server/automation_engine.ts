import { promises as fs } from 'fs';
import path from 'path';

export type AutomationFunction = (event: Record<string, unknown>) => Promise<void>;

interface LoadedAutomation {
    name: string;
    handler: AutomationFunction;
}

const AUTOMATIONS_DIR = path.join(process.cwd(), 'automations');
const loadedAutomations: Map<string, LoadedAutomation> = new Map();

export const loadAutomations = async () => {
    try {
        await fs.mkdir(AUTOMATIONS_DIR, { recursive: true });
        const files = await fs.readdir(AUTOMATIONS_DIR);
        
        for (const file of files) {
            if (file.endsWith('.js') || file.endsWith('.ts')) {
                const name = file.replace(/\.(js|ts)$/, '');
                const filePath = path.join(AUTOMATIONS_DIR, file);
                
                // Dynamic import (cache busting might be needed in real prod)
                // For now, we assume simple restart on change or basic dynamic import
                try {
                    const module = await import(filePath);
                    if (typeof module.default === 'function') {
                        loadedAutomations.set(name, {
                            name,
                            handler: module.default
                        });
                        console.log(`[ELO] Loaded automation: ${name}`);
                    }
                } catch (err) {
                    console.error(`[ELO] Failed to load automation ${name}:`, err);
                }
            }
        }
    } catch (error) {
        console.error('[ELO] Automation loader error:', error);
    }
};

export const runAutomations = async (event: Record<string, unknown>) => {
    const promises = Array.from(loadedAutomations.values()).map(async (auto) => {
        try {
            await auto.handler(event);
        } catch (error) {
            console.error(`[ELO] Error running automation ${auto.name}:`, error);
        }
    });
    
    await Promise.all(promises);
};
