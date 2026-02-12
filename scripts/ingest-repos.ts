import axios from 'axios';
import fs from 'fs';
import path from 'path';

/**
 * Script para buscar metadados de dispositivos de repositórios Open Source
 * Isso ajuda a construir uma base de dados local de "IDs de Modelos" e "Fabricantes"
 */

interface DeviceEntry {
    repo: string;
    vendor: string;
    model: string;
    description?: string;
}

const REPOS_TO_INDEX = [
    {
        owner: 'Koenkk',
        repo: 'zigbee-herdsman-converters',
        path: 'src/devices'
    },
    {
        owner: 'zwave-js',
        repo: 'node-zwave-js',
        path: 'packages/config/config/devices'
    }
];

async function fetchRepoContents(owner: string, repo: string, path: string) {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    console.log(`[Ingest] Buscando conteúdos de ${owner}/${repo}...`);
    
    try {
        const response = await axios.get(url, {
            headers: {
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'ELO-Automation-Engine'
            }
        });

        if (Array.isArray(response.data)) {
            // Retorna lista de arquivos/diretórios
            return response.data.map((item: any) => ({
                name: item.name,
                type: item.type,
                download_url: item.download_url
            }));
        }
    } catch (error: any) {
        console.error(`[Ingest] Erro ao buscar ${owner}/${repo}: ${error.message}`);
    }
    return [];
}

async function run() {
    const dbPath = path.join(process.cwd(), 'logs/knowledge_index.json');
    let db: DeviceEntry[] = [];

    for (const source of REPOS_TO_INDEX) {
        const items = await fetchRepoContents(source.owner, source.repo, source.path);
        
        // Exemplo: Indexando apenas os nomes dos arquivos como "modelos conhecidos"
        items.forEach(item => {
            if (item.type === 'file' && item.name.endsWith('.js') || item.name.endsWith('.ts') || item.name.endsWith('.json')) {
                db.push({
                    repo: `${source.owner}/${source.repo}`,
                    vendor: source.owner,
                    model: item.name.split('.')[0],
                    description: `Descoberto via indexação automática`
                });
            } else if (item.type === 'dir') {
                 db.push({
                    repo: `${source.owner}/${source.repo}`,
                    vendor: item.name,
                    model: 'generic',
                    description: `Diretório de fabricante`
                });
            }
        });
    }

    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
    console.log(`[Ingest] Concluído! ${db.length} referências salvas em logs/knowledge_index.json`);
}

run().catch(console.error);
