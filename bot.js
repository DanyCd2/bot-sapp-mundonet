// ====================== CONFIGURAÇÕES INICIAIS ======================
const { Client, MessageMedia } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode-terminal');
const express = require('express');
const { createClient } = require('@supabase/supabase-js');

// Configurações do Supabase (substitua com suas credenciais)
const supabaseUrl = 'https://njncdjvyanuhcpwpbjly.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5qbmNkanZ5YW51aGNwd3Biamx5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM0NTIxMTEsImV4cCI6MjA1OTAyODExMX0.Pd7hFzQDd4TMPfGzKu9MASXm3mM1SzMGMyqEXbAOwII';
const supabase = createClient(supabaseUrl, supabaseKey);

// Configurações
const ADMIN_NUMBER = '+258855337491'; // SEU NÚMERO (com código do país)
const imagePath = path.join(__dirname, 'p.png'); // Imagem da tabela de pacotes

// Cache e controle de usuários
const users = {};

// ====================== FUNÇÕES AUXILIARES ======================
// Sistema de logs melhorado
function log(message) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${message}`);
    fs.appendFileSync('bot.log', `[${timestamp}] ${message}\n`);
}

// Função para salvar clientes (ATUALIZADA para Supabase)
async function salvarCliente(nome, numero) {
    const { error } = await supabase
        .from('clientes')
        .upsert({ nome, numero });
    
    if (error) {
        log(`Erro ao salvar cliente: ${error.message}`);
        return false;
    }
    log(`Novo cliente salvo: ${nome} (${numero})`);
    return true;
}

// Função para filtrar clientes por período (ATUALIZADA para Supabase)
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
        
        query = query.gte('data', dateFilter.toISOString());
    }
    
    const { data, error } = await query;
    
    if (error) {
        log(`Erro ao buscar clientes: ${error.message}`);
        return [];
    }
    
    return data;
}

// ====================== CONFIGURAÇÃO DO BOT ======================
const client = new Client({
    authStrategy: {
        async restore() {
            const { data } = await supabase
                .from('whatsapp_sessions')
                .select('session_data')
                .eq('id', 'primary');
            return data?.[0]?.session_data || null;
        },
        async save(session) {
            await supabase
                .from('whatsapp_sessions')
                .upsert({ id: 'primary', session_data: session });
        },
        async remove() {
            await supabase
                .from('whatsapp_sessions')
                .delete()
                .eq('id', 'primary');
        }
    },
    puppeteer: { 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

// ====================== EVENTOS DO BOT ======================
client.on('qr', qr => {
    log('QR Code gerado - Escaneie para autenticar');
    qrcode.generate(qr, { small: true });
});

client.on('authenticated', () => {
    log('Autenticação realizada com sucesso');
});

client.on('auth_failure', msg => {
    log(`Falha na autenticação: ${msg}`);
    const delay = Math.floor(Math.random() * 60000) + 30000;
    setTimeout(() => client.initialize(), delay);
});

client.on('disconnected', reason => {
    log(`Desconectado: ${reason}`);
    let attempts = 0;
    const reconnect = () => {
        attempts++;
        const delay = Math.min(attempts * 5000, 300000);
        log(`Tentativa ${attempts} de reconexão em ${delay/1000}s...`);
        setTimeout(() => client.initialize().catch(reconnect), delay);
    };
    reconnect();
});

client.on('ready', () => {
    log('✅ Bot está online e operacional!');
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

    // Processamento assíncrono do salvamento
    setTimeout(() => salvarCliente(name, numero), 0);

    // COMANDOS ADMIN
    if (numero === ADMIN_NUMBER.replace('+', '')) {
        if (text === '!clientes') {
            const lista = await filtrarClientes('todos');
            await msg.reply(`📋 *TODOS OS CLIENTES (${lista.length})*\n\n${
                lista.map(c => `👤 ${c.nome} - ${c.numero}`).join('\n') || "Nenhum cliente."
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

    // Verifica se está no modo de suporte humano (não responde)
    if (users[phone]?.state === 'HUMAN_SUPPORT') {
        return;
    }

    switch (users[phone]?.state) {
        case 'MENU':
            await handleMenu(msg, text, phone, name);
            break;
            
        case 'WAITING_PAYMENT':
            if (msg.hasMedia || /(transferi|paguei|confirmado|id de transação|saldo)/i.test(text)) {
                await msg.reply(
                    `🔄 *Pagamento em verificação!*\n\n` +
                    `Estamos confirmando seu pagamento.\n` +
                    `Aguarde até receber seu pacote.\n\n` +
                    `Obrigado por escolher a MUNDO NET! 💖\n\n` +
                    `*Para voltar ao menu digite*: V ou voltar`
                );
                users[phone] = { 
                    state: 'WAITING_CONFIRMATION',
                    lastInteraction: Date.now()
                };
            } else if (/^(voltar|v|menu)/.test(text)) {
                users[phone] = { 
                    state: 'MENU',
                    lastInteraction: Date.now()
                };
                await showMenu(msg);
            }
            break;
           
        case 'WAITING_CONFIRMATION':
            if (/(aguardando|esperando|quando|demora)/i.test(text)) {
                await msg.reply(
                    `⏳ *Pagamento em verificação*\n\n` +
                    `Seu pagamento ainda está sendo confirmado. Por favor, aguarde.\n\n` +
                    `*Para voltar ao menu digite*: V ou voltar`
                );
                users[phone].lastInteraction = Date.now();
            } else if (/^(voltar|v|menu)/.test(text)) {
                users[phone] = { 
                    state: 'MENU',
                    lastInteraction: Date.now()
                };
                await showMenu(msg);
            }
            break;
            
        case 'ACTIVE': // Modo não-automático
            if (/^(menu|dex|auto)/i.test(text)) {
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
            }
            break;
            
        default:
            users[phone] = { 
                state: 'MENU',
                lastInteraction: Date.now()
            };
            await showMenu(msg);
    }
}

client.on('message', async msg => {
    try {
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), 10000);

        await Promise.race([
            handleMessage(msg),
            timeoutPromise
        ]);
    } catch (error) {
        log(`Erro ao processar mensagem: ${error}`);
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
        client.initialize().catch(error => 
            log(`Erro ao reiniciar: ${error}`));
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
        app.listen(PORT, () => {
            log(`Health check rodando na porta ${PORT}`);
        });

        client.initialize();
        log('Bot iniciado com sucesso');
    } catch (error) {
        log(`Erro crítico: ${error}`);
        process.exit(1);
    }
}

// Inicia o bot
startBot();

// Limpeza ao encerrar
process.on('SIGINT', () => {
    log('Encerrando bot...');
    client.destroy();
    process.exit();
});