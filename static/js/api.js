/* =========================================================
   api.js - Cliente HTTP para a API Flask
   ========================================================= */

const API = (() => {

    async function request(method, url, body = null) {
        const opts = {
            method,
            headers: { 'Content-Type': 'application/json' },
        };
        if (body && method !== 'GET') {
            opts.body = JSON.stringify(body);
        }
        try {
            const resp = await fetch(url, opts);
            if (!resp.ok) {
                const err = await resp.json().catch(() => ({ error: resp.statusText }));
                throw new Error(err.error || `Erro ${resp.status}`);
            }
            return await resp.json();
        } catch (e) {
            console.error(`API ${method} ${url}:`, e);
            throw e;
        }
    }

    return {
        // Responsáveis
        responsaveis: {
            list:   ()           => request('GET',  '/api/responsaveis'),
            create: (data)       => request('POST', '/api/responsaveis', data),
            update: (id, data)   => request('PUT',  `/api/responsaveis/${id}`, data),
            delete: (id)         => request('DELETE', `/api/responsaveis/${id}`),
        },
        // Setores
        setores: {
            list:   ()           => request('GET',  '/api/setores'),
            create: (data)       => request('POST', '/api/setores', data),
            update: (id, data)   => request('PUT',  `/api/setores/${id}`, data),
            delete: (id)         => request('DELETE', `/api/setores/${id}`),
        },
        // Projetos
        projetos: {
            list:   (params = {}) => {
                const qs = new URLSearchParams();
                for (const [k, v] of Object.entries(params)) {
                    if (Array.isArray(v)) v.forEach(x => qs.append(k, x));
                    else if (v != null && v !== '') qs.append(k, v);
                }
                return request('GET', `/api/projetos?${qs}`);
            },
            get:    (id)         => request('GET',  `/api/projetos/${id}`),
            create: (data)       => request('POST', '/api/projetos', data),
            update: (id, data)   => request('PUT',  `/api/projetos/${id}`, data),
            delete: (id)         => request('DELETE', `/api/projetos/${id}`),
            analise:   (id, data) => request('POST', `/api/projetos/${id}/analise`, data),
            finalizar: (id, data) => request('POST', `/api/projetos/${id}/finalizar`, data),
            cancelar:  (id)       => request('POST', `/api/projetos/${id}/cancelar`),
            pausar:    (id)       => request('POST', `/api/projetos/${id}/pausar`),
            cobranca:  (id, data) => request('POST', `/api/projetos/${id}/cobranca`, data),
            atualizacao:(id, data)=> request('POST', `/api/projetos/${id}/atualizacoes`, data),
            exportPdf: (id, data) => request('POST', `/api/projetos/${id}/pdf`, data),
        },
        // Atividades
        atividades: {
            list:   (projId)     => request('GET',  `/api/projetos/${projId}/atividades`),
            create: (projId, d)  => request('POST', `/api/projetos/${projId}/atividades`, d),
            batch:  (projId, d)  => request('POST', `/api/projetos/${projId}/atividades/batch`, d),
            update: (id, data)   => request('PUT',  `/api/atividades/${id}`, data),
            delete: (id)         => request('DELETE', `/api/atividades/${id}`),
            finalizar: (id, data)=> request('POST', `/api/atividades/${id}/finalizar`, data),
        },
        // Dashboard
        dashboard: (params = {}) => {
            const qs = new URLSearchParams();
            for (const [k, v] of Object.entries(params)) {
                if (Array.isArray(v)) v.forEach(x => qs.append(k, x));
                else if (v != null && v !== '') qs.append(k, v);
            }
            return request('GET', `/api/dashboard?${qs}`);
        },
        // Relatório Diário
        relatorioDiario: () => request('GET', '/api/relatorio-diario'),
        // Helpers de cálculo
        calcular: {
            previsao: (data) => request('POST', '/api/calcular/previsao', data),
            inicio:   (data) => request('POST', '/api/calcular/inicio', data),
        },
        // Exportar Gantt (envia imagem para servidor)
        exportGantt: (data) => request('POST', '/api/exports/gantt', data),
        // Modelos de Atividades
        modelos: {
            list:   ()         => request('GET',  '/api/modelos'),
            get:    (id)       => request('GET',  `/api/modelos/${id}`),
            create: (data)     => request('POST', '/api/modelos', data),
            update: (id, data) => request('PUT',  `/api/modelos/${id}`, data),
            delete: (id)       => request('DELETE', `/api/modelos/${id}`),
            getAtividades:    (id)       => request('GET',  `/api/modelos/${id}/atividades`),
            saveAtividades:   (id, data) => request('POST', `/api/modelos/${id}/atividades`, data),
        },
    };
})();
