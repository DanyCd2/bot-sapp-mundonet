// ====================== CONFIGURAÇÕES INICIAIS ======================
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode-terminal');
const express = require('express');
const { createClient } = require('@supabase/supabase-js');

// Configurações do Supabase
const supabaseUrl = 'https://njncdjvyanuhcpwpbjly.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5qbmNkanZ5YW51aGNwd3Biamx5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM0NTIxMTEsImV4cCI6MjA1OTAyODExMX0.Pd7hFzQDd4TMPfGzKu9MASXm3mM1SzMGMyqEXbAOwII';
const supabase = createClient(supabaseUrl, supabaseKey);

// Configurações
const ADMIN_NUMBER = '+258855337491';
const imagePath = path.join(__dirname, 'p.png');
const users = {};
const backupPath = path.join(__dirname, 'backups');

// Criar pasta de backups se não existir
if (!fs.existsSync(backupPath)) {
    fs.mkdirSync(backupPath);
}

// ====================== FUNÇÕES AUXILIARES // Função de log melhorada
function log(message) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${message}`);
    fs.appendFileSync('bot.log', `[${timestamp}] ${message}\n`);
}

// 1️⃣ BACKUP AUTOMÁTICO DIÁRIO
async function fazerBackupClientes() {
    try {
        const { data } = await supabase.from('clientes').select('*');
        const hoje = new Date().toISOString().split('T')[0];
        fs.writeFileSync(path.join(backupPath, `backup-${hoje}.json`), JSON.stringify(data, null, 2));
        log(`Backup criado para ${hoje}`);
    } catch (error) {
        log(`Erro no backup: ${error.message}`);
    }
}

// 2️⃣ VALIDAÇÃO E FORMATAÇÃO DE NÚMEROS (versão mais completa)
function validarNumero(numero) {
    try {
        const num = numero.replace(/[^\d+]/g, '');
        const valido = /^(\+258|258|0)?[8][2-8]\d{7}$/.test(num) || 
                      /^\+\d{10,15}$/.test(num);
        
        if (!valido) {
            log(`Número inválido rejeitado: ${numero} (formato não reconhecido)`);
        }
        return valido;
    } catch (error) {
        log(`Erro na validação do número ${numero}: ${error.message}`);
        return false;
    }
}

function formatarNumero(numero) {
    try {
        const num = numero.replace(/[^\d+]/g, '');
        let formatado;
        
        if (/^(258|0)/.test(num)) {
            formatado = '+258' + num.replace(/^(258|0)/, '');
        } else {
            formatado = num.startsWith('+') ? num : `+${num}`;
        }
        
        // Log se a formatação alterou o número original
        if (formatado !== numero.replace(/[^\d+]/g, '')) {
            log(`Número formatado: ${numero} → ${formatado}`);
        }
        
        return formatado;
    } catch (error) {
        log(`Erro ao formatar número ${numero}: ${error.message}`);
        return numero; // Retorna original em caso de erro
    }
}

// Cache para controle de atualizações diárias
const clientesAtualizadosHoje = new Set();

// 3️⃣ SALVAR CLIENTE (versão mais completa)
async function salvarCliente(nome, numero) {
    try {
        // Verifica se já foi atualizado hoje
        if (clientesAtualizadosHoje.has(numero)) return true;

        const numeroValido = validarNumero(numero);
        if (!numeroValido) {
            log(`Número inválido: ${numero}`);
            return false;
        }

        const numeroFormatado = formatarNumero(numero);
        const hoje = new Date().toISOString().split('T')[0];

        const { error } = await supabase
            .from('clientes')
            .upsert({
                nome: nome,
                numero: numeroFormatado,
                ultima_atualizacao: new Date().toISOString(),
                data_criacao: hoje,
                pais: numeroFormatado.startsWith('+258') ? 'MZ' : 'INT'
            }, { onConflict: 'numero' });

        if (error) throw error;
        
        clientesAtualizadosHoje.add(numero);
        log(`Cliente registrado: ${nome} (${numeroFormatado})`);
        return true;
    } catch (error) {
        log(`Erro ao salvar cliente: ${error.message}`);
        return false;
    }
}

// 4️⃣ RELATÓRIO SEMANAL (versão mais completa)
async function enviarRelatorioSemanal() {
    try {
        const umaSemanaAtras = new Date();
        umaSemanaAtras.setDate(umaSemanaAtras.getDate() - 7);

        const { count: total } = await supabase
            .from('clientes')
            .select('*', { count: 'exact', head: true });

        const { data: novos } = await supabase
            .from('clientes')
            .select('nome, numero, pais, ultima_atualizacao')
            .gte('ultima_atualizacao', umaSemanaAtras.toISOString())
            .order('ultima_atualizacao', { ascending: false })
            .limit(5);

        const relatorio = `
📅 *RELATÓRIO SEMANAL*
🆕 Novos clientes: ${novos.length}
🌍 Internacionais: ${novos.filter(c => c.pais === 'INT').length}
📊 Total na base: ${total}
-------------------------
📌 Últimos cadastros:
${novos.map(c => `• ${c.numero} (${c.nome || 'Sem nome'}) ${c.pais === 'INT' ? '🌍' : ''}`).join('\n')}
`;

        await client.sendMessage(
            `${ADMIN_NUMBER.replace('+', '')}@c.us`, 
            relatorio
        );
    } catch (error) {
        log(`Erro no relatório: ${error.message}`);
    }
}

// 5️⃣ FUNÇÕES ADICIONAIS PARA MANIPULAÇÃO DE DADOS
async function buscarContatosPorPeriodo(dataInicio, dataFim) {
    const { data, error } = await supabase
        .from('clientes')
        .select('*')
        .gte('ultima_atualizacao', dataInicio)
        .lte('ultima_atualizacao', dataFim)
        .order('ultima_atualizacao', { ascending: false });

    if (error) {
        log(`Erro na busca histórica: ${error.message}`);
        return [];
    }
    return data;
}

async function filtrarClientes(periodo) {
    let query = supabase.from('clientes').select('*');
    
    if (periodo !== 'todos') {
        const dateFilter = new Date();
        
        switch (periodo) {
            case 'hoje': dateFilter.setDate(dateFilter.getDate() - 1); break;
            case 'ontem': dateFilter.setDate(dateFilter.getDate() - 2); break;
            case 'semana': dateFilter.setDate(dateFilter.getDate() - 7); break;
            case 'mes': dateFilter.setMonth(dateFilter.getMonth() - 1); break;
            case '3meses': dateFilter.setMonth(dateFilter.getMonth() - 3); break;
            case '6meses': dateFilter.setMonth(dateFilter.getMonth() - 6); break;
            case '1ano': dateFilter.setFullYear(dateFilter.getFullYear() - 1); break;
        }
        
        query = query.gte('data_criacao', dateFilter.toISOString());
    }
    
    const { data, error } = await query;
    
    if (error) {
        log(`Erro ao buscar clientes: ${error.message}`);
        return [];
    }
    
    return data;
}

// 6️⃣ HANDLERS PARA COMANDOS ESPECÍFICOS
async function handleMigracaoPeriodo(msg) {
    try {
        await msg.reply("⏳ Iniciando migração de contatos (29/03 a 01/04)...");
        
        const dataInicio = '2025-03-29T00:00:00';
        const dataFim = '2025-04-01T23:59:59';
        const contatos = await buscarContatosPorPeriodo(dataInicio, dataFim);
        
        if (contatos.length === 0) {
            await msg.reply("ℹ️ Nenhum contato encontrado no período especificado");
            return;
        }
        
        await msg.reply(`🔍 ${contatos.length} contatos encontrados. Iniciando processamento...`);
        
        let sucessos = 0;
        for (let i = 0; i < contatos.length; i += 50) {
            const lote = contatos.slice(i, i + 50);
            const { error } = await supabase.from('clientes').upsert(lote, { onConflict: 'numero' });
            
            if (error) throw error;
            sucessos += lote.length;
            
            if (i % 100 === 0 || i + 50 >= contatos.length) {
                await msg.reply(`📦 ${sucessos}/${contatos.length} (${Math.round((sucessos/contatos.length)*100)}%)`);
            }
        }
        
        await msg.reply(`✅ Migração concluída com sucesso! ${sucessos} contatos atualizados.`);
    } catch (error) {
        log(`Erro na migração: ${error.message}`);
        await msg.reply(`❌ Falha na migração: ${error.message}`);
    }
}

async function handleVerificarDuplicados(msg) {
    try {
        const { data, error } = await supabase.rpc('contar_duplicados');
        
        if (error) throw error;
        
        await msg.reply(`🔍 Resultado da verificação:\n` +
                       `- Números únicos: ${data[0].unicos}\n` +
                       `- Números duplicados: ${data[0].duplicados}\n` +
                       `- Registros afetados: ${data[0].total_duplicatas}`);
    } catch (error) {
        log(`Erro ao verificar duplicados: ${error.message}`);
        await msg.reply(`❌ Erro na verificação: ${error.message}`);
    }
}

module.exports = {
    log,
    fazerBackupClientes,
    validarNumero,
    formatarNumero,
    salvarCliente,
    enviarRelatorioSemanal,
    buscarContatosPorPeriodo,
    filtrarClientes,
    handleMigracaoPeriodo,
    handleVerificarDuplicados
};


// ====================== CONFIGURAÇÃO DO BOT ======================

const client = new Client({
    authStrategy: new LocalAuth({ dataPath: './session' }),
    puppeteer: { headless: true, args: ['--no-sandbox'] }
});

// Integração com Supabase
client.on('authenticated', async (session) => {
    await supabase
        .from('whatsapp_sessions')
        .upsert({ 
            id: 'primary', 
            session_data: session 
        });
    log('Sessão autenticada e salva no Supabase');
});

client.on('auth_failure', async (msg) => {
    await supabase
        .from('whatsapp_sessions')
        .delete()
        .eq('id', 'primary');
    log(`Falha na autenticação: ${msg}`);
});

// ====================== EVENTOS DO BOT ======================
client.on('qr', qr => {
    log('QR Code gerado - Escaneie para autenticar');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    log('✅ Bot está online e operacional!');
});

client.on('disconnected', async (reason) => {
    log(`Desconectado: ${reason}`);
    await supabase
        .from('whatsapp_sessions')
        .delete()
        .eq('id', 'primary');
    setTimeout(() => client.initialize(), 30000);
});

// ====================== FUNÇÕES DO MENU ======================
async function showMenu(msg) {
    await msg.reply(
        `Como posso ajudar?\n\n` +
        `1️⃣ Quero comprar\n` +
        `2️⃣ Tabela de pacotes\n` +
        `3️⃣ Grupo de WhatsApp\n` +
        `4️⃣ Quero ganhar dinheiro\n` +
        `5️⃣ Sobre nós\n` +
        `6️⃣ Falar com humano\n` +
        `7️⃣ Sair do modo automático\n\n` +
        `Digite o número ou nome da opção`
    );
}

async function handleMenu(msg, text, phone, name) {
    try {
        switch (true) {
            case /^(1|comprar)/.test(text):
                users[phone] = { 
                    state: 'WAITING_PAYMENT',
                    lastInteraction: Date.now()
                };
                await msg.reply(
                    `💳 *FORMAS DE PAGAMENTO*\n\n` +
                    `MPESA: 856429915\n` +
                    `EMOLA: 868663198\n\n` +
                    `Por favor, envie:\n` +
                    `1. Comprovante de pagamento (foto ou texto)\n` +
                    `2. Número para ativação\n\n` +
                    `*Para voltar ao menu digite*: V ou voltar`
                );
                break;

            case /^(2|tabela)/.test(text):
                if (fs.existsSync(imagePath)) {
                    const media = MessageMedia.fromFilePath(imagePath);
                    await msg.reply(media, null, { caption: '📊 *TABELA DE PACOTES MUNDO NET*\n\n*Para voltar ao menu digite*: V ou voltar' });
                } else {
                    await msg.reply(
                        `📊 *TABELA DE PACOTES*\n\n` +
                        `*DIÁRIOS:*\n- 1024MB → 20MT\n- 2048MB → 40MT\n- 4096MB → 80MT\n- 5120MB → 100MT\n\n` +
                        `*MENAIS:*\n- 5120MB → 160MT\n- 10240MB → 260MT\n- 20480MB → 460MT\n- 30720MB → 660MT\n\n` +
                        `*ILIMITADOS:*\n- 11GB+ILIM. → 450MT\n- 20GB+ILIM. → 630MT\n- 30GB+ILIM. → 830MT\n\n` +
                        `*Para voltar ao menu digite*: V ou voltar`
                    );
                }
                break;

            case /^(3|grupo)/.test(text):
                await msg.reply(
                    `👥 *GRUPOS WHATSAPP*\n\n` +
                    `1. Principal: https://chat.whatsapp.com/InEmq5uoLB8CQNW9p0FjFR\n` +
                    `2. Clientes: https://chat.whatsapp.com/LdZJB4dxSoB24TyQEgVsXd\n\n` +
                    `*Para voltar ao menu digite*: V ou voltar`
                );
                break;

            case /^(4|ganhar)/.test(text):
                await msg.reply(
                    `🚧 *OPÇÃO EM MANUTENÇÃO*\n\n` +
                    `Estamos preparando esta funcionalidade para você!\n` +
                    `Volte em breve. 💖\n\n` +
                    `*Para voltar ao menu digite*: V ou voltar`
                );
                break;

            case /^(5|sobre)/.test(text):
                await msg.reply(
                    `🌐 *SOBRE A MUNDO NET*\n\n` +
                    `Líder em internet, chamadas e SMS!\n\n` +
                    `*Redes sociais:*\n` +
                    `Facebook: MUNDO NET\n` +
                    `WhatsApp: 868663198\n` +
                    `Instagram: @mundo_net_mz\n\n` +
                    `*Sua conexão com o mundo!* 🌟\n\n` +
                    `*Para voltar ao menu digite*: V ou voltar`
                );
                break;

            case /^(6|humano)/.test(text):
                users[phone] = { 
                    state: 'HUMAN_SUPPORT',
                    lastInteraction: Date.now()
                };
                await msg.reply(
                    `👨‍💼 *ATENDIMENTO HUMANO*\n\n` +
                    `Você será atendido em até *24 horas*.\n\n` +
                    `⚠️ O bot *não responderá* mensagens neste período.`
                );
                break;

            case /^(7|sair)/.test(text):
                users[phone] = { 
                    state: 'ACTIVE',
                    lastInteraction: Date.now()
                };
                await msg.reply(
                    `🔓 *Modo não-automático ativo*\n\n` +
                    `Agora só responderei aos comandos:\n` +
                    `• menu - Volta ao menu principal\n` +
                    `• dex - Mostra mensagem do assistente\n` +
                    `• auto - Reativa o modo automático\n\n` +
                    `*Digite um desses comandos para interagir*`
                );
                break;

            default:
                await msg.reply(
                    `❌ Opção inválida, ${name}!\n\n` +
                    `*Para voltar ao menu digite*: V ou voltar`
                );
        }
    } catch (error) {
        log(`Erro no menu: ${error}`);
        users[phone] = { state: 'MENU' };
        await msg.reply(`Vamos voltar ao menu principal:`);
        await showMenu(msg);
    }
}

// ====================== TRATAMENTO DE MENSAGENS ======================
async function handleMessage(msg) {
    if (msg.from.endsWith('@g.us')) return;

    const phone = msg.from;
    const numero = phone.replace('@c.us', '');
    const text = msg.body.toLowerCase().trim();
    const name = (await msg.getContact()).pushname || 'Cliente';
    const isNewUser = !users[phone];

    setTimeout(() => salvarCliente(name, numero), 0);

    // COMANDOS ADMIN
    if (numero === ADMIN_NUMBER.replace('+', '')) {
        if (text === '!clientes') {
            const lista = await filtrarClientes('todos');
            await msg.reply(`📋 *TODOS OS CLIENTES (${lista.length})*\n\n${
                lista.slice(0, 50).map(c => `👤 ${c.nome} - ${c.numero}`).join('\n') + 
                (lista.length > 50 ? `\n\n...e mais ${lista.length - 50} clientes` : "") || "Nenhum cliente."
            }`);
            return;
        } else if (text.startsWith('!clientes ')) {
            const periodo = text.split(' ')[1];
            const periodosValidos = ['hoje', 'ontem', 'semana', 'mes', '3meses', '6meses', '1ano'];
            
            if (periodosValidos.includes(periodo)) {
                const lista = await filtrarClientes(periodo);
                await msg.reply(`📋 *CLIENTES (${periodo.toUpperCase()}) - ${lista.length}*\n\n${
                    lista.map(c => `👤 ${c.nome} - ${c.numero}`).join('\n') || "Nenhum cliente."
                }`);
                return;
            }
        } else if (text === '!migrar-periodo') {
            await handleMigracaoPeriodo(msg);
            return;
        } else if (text === '!verificar-duplicados') {
            await handleVerificarDuplicados(msg);
            return;
        }
    }

    // FLUXO DE ATENDIMENTO
    if (isNewUser) {
        await msg.reply(`🌟 *Bem-vindo(a) à MUNDO NET, ${name}!* 😊\nAqui é o Dex, seu assistente virtual! Como posso ajudar?`);
        users[phone] = { 
            state: 'MENU',
            lastInteraction: Date.now()
        };
        await showMenu(msg);
        return;
    } else if (/^(menu|oi|ola|voltar|v)/.test(text)) {
        await msg.reply(`👋 Oi ${name}! Como posso te ajudar?`);
        users[phone] = { 
            state: 'MENU',
            lastInteraction: Date.now()
        };
        await showMenu(msg);
        return;
    }

    if (users[phone]?.state === 'HUMAN_SUPPORT') return;

    switch (users[phone]?.state) {
        case 'MENU': await handleMenu(msg, text, phone, name); break;
            
        case 'WAITING_PAYMENT':
            if (msg.hasMedia || /(transferi|paguei|confirmado|id de transação|saldo)/i.test(text)) {
                await msg.reply(`🔄 *Pagamento em verificação!*\n\nAguarde até receber seu pacote.\n\n*Para voltar ao menu digite*: V ou voltar`);
                users[phone] = { state: 'WAITING_CONFIRMATION', lastInteraction: Date.now() };
            } else if (/^(voltar|v|menu)/.test(text)) {
                users[phone] = { state: 'MENU', lastInteraction: Date.now() };
                await showMenu(msg);
            }
            break;
           
        case 'WAITING_CONFIRMATION':
            if (/(aguardando|esperando|quando|demora)/i.test(text)) {
                await msg.reply(`⏳ *Pagamento em verificação*\n\nPor favor, aguarde.\n\n*Para voltar ao menu digite*: V ou voltar`);
                users[phone].lastInteraction = Date.now();
            } else if (/^(voltar|v|menu)/.test(text)) {
                users[phone] = { state: 'MENU', lastInteraction: Date.now() };
                await showMenu(msg);
            }
            break;
            
        case 'ACTIVE':
            if (/^menu/i.test(text)) {
                users[phone] = { state: 'MENU' };
                await showMenu(msg);
            } else if (/^dex/i.test(text)) {
                await msg.reply(`👋 Oi! Sou o Dex, seu assistente virtual! Digite "menu" para ver opções.`);
            } else if (/^auto/i.test(text)) {
                users[phone] = { state: 'MENU' };
                await msg.reply(`✅ Modo automático reativado!`);
                await showMenu(msg);
            }
            break;
            
        default:
            users[phone] = { state: 'MENU', lastInteraction: Date.now() };
            await showMenu(msg);
    }
}

client.on('message', async (msg) => {
    try {
        let timeoutHandle;
        const cleanup = () => clearTimeout(timeoutHandle);

        const timeoutPromise = new Promise((_, reject) => {
            timeoutHandle = setTimeout(() => {
                reject(new Error('Timeout após 10 segundos'));
            }, 10000);
        });

        await Promise.race([
            handleMessage(msg).finally(cleanup),
            timeoutPromise
        ]);
    } catch (error) {
        if (error.message.includes('Timeout')) {
            log(`Mensagem não processada a tempo: ${msg.body.substring(0, 50)}...`);
        } else {
            log(`Erro no processamento: ${error.stack || error}`);
        }
    }
});

// ====================== SERVIDOR EXPRESS ======================
const app = express();
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'online',
        whatsapp: client.info ? 'connected' : 'disconnected',
        uptime: process.uptime()
    });
});

// ====================== MONITORAMENTO 24/7 ======================
setInterval(() => {
    if (!client.info) {
        log('Client não conectado - tentando reiniciar...');
        client.initialize().catch(error => log(`Erro ao reiniciar: ${error}`));
    }
}, 300000);

setInterval(() => {
    const now = Date.now();
    const inactiveTime = 24 * 60 * 60 * 1000;
    for (const [phone, data] of Object.entries(users)) {
        if (data.lastInteraction && now - data.lastInteraction > inactiveTime) {
            delete users[phone];
            log(`Removido usuário inativo: ${phone}`);
        }
    }
}, 3600000);


// ====================== INICIALIZAÇÃO ======================
async function startBot() {
    try {
        const PORT = process.env.PORT || 3000;
        app.listen(PORT, () => log(`Servidor rodando na porta ${PORT}`));

        // Agenda tarefas automáticas
        setInterval(() => {
            const agora = new Date();
            
            // Backup diário às 2AM
            if (agora.getHours() === 2 && agora.getMinutes() === 0) {
                fazerBackupClientes();
            }
            
            // Relatório semanal às segundas 9AM
            if (agora.getDay() === 1 && agora.getHours() === 9) {
                enviarRelatorioSemanal();
            }

            // Limpa cache diário à meia-noite
            if (agora.getHours() === 0) {
                clientesAtualizadosHoje.clear();
                log("Cache diário de clientes limpo");
            }
        }, 60000); // Verifica a cada minuto

        client.initialize();
    } catch (error) {
        log(`Erro na inicialização: ${error}`);
        process.exit(1);
    }
}

// Inicia o bot
startBot();

// Limpeza ao encerrar
process.on('SIGINT', () => {
    log('Encerrando bot...');
    client.destroy().then(() => process.exit());
});