// ====================== CONFIGURAÇÕES INICIAIS ======================
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode-terminal');
const express = require('express');

// Configurações
const clientesFile = path.join(__dirname, 'clientes.json');
const ADMIN_NUMBER = '+258855337491'; // SEU NÚMERO (com código do país)
const imagePath = path.join(__dirname, 'p.png'); // Imagem da tabela de pacotes
const SESSION_DIR = process.env.SESSION_DIR || './session';

// Controle de usuários (para fluxo de atendimento)
const users = {};

// ====================== FUNÇÕES AUXILIARES ======================
// Sistema de logs melhorado
function log(message) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${message}`);
    fs.appendFileSync('bot.log', `[${timestamp}] ${message}\n`);
}

// Função para salvar clientes (ATUALIZADA)
function salvarCliente(nome, numero) {
    let clientes = [];

    if (fs.existsSync(clientesFile)) {
        try {
            const fileContent = fs.readFileSync(clientesFile, 'utf-8');
            clientes = JSON.parse(fileContent);
            
            if (!Array.isArray(clientes)) {
                log("Arquivo de clientes corrompido. Recriando...");
                clientes = [];
            }
        } catch (error) {
            log("Erro ao ler clientes.json. Recriando...");
            clientes = [];
        }
    }

    const clienteJaExiste = clientes.some(cliente => cliente.numero === numero);
    
    if (!clienteJaExiste) {
        clientes.push({
            nome,
            numero,
            data: new Date().toISOString()
        });
        fs.writeFileSync(clientesFile, JSON.stringify(clientes, null, 2));
        log(`Novo cliente salvo: ${nome} (${numero})`);
    }
}

// Função para filtrar clientes por período
function filtrarClientes(periodo) {
    if (!fs.existsSync(clientesFile)) return [];
    const clientes = JSON.parse(fs.readFileSync(clientesFile, 'utf-8'));
    const hoje = new Date();
    const umDia = 24 * 60 * 60 * 1000;

    return clientes.filter(cliente => {
        const dataCliente = new Date(cliente.data);
        const diferencaDias = Math.floor((hoje - dataCliente) / umDia);

        switch (periodo) {
            case 'hoje': return diferencaDias === 0;
            case 'ontem': return diferencaDias === 1;
            case 'semana': return diferencaDias <= 7;
            case 'mes': return diferencaDias <= 30;
            case '3meses': return diferencaDias <= 90;
            case '6meses': return diferencaDias <= 180;
            case '1ano': return diferencaDias <= 365;
            default: return true;
        }
    });
}

// ====================== CONFIGURAÇÃO DO BOT ======================
const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: SESSION_DIR,
        backupSyncIntervalMs: 300000 // Backup a cada 5 minutos
    }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--single-process'
        ],
        executablePath: process.env.CHROME_PATH || undefined
    },
    takeoverOnConflict: true,
    restartOnAuthFail: true
});

// ====================== EVENTOS DO BOT ======================
client.on('qr', qr => {
    log('QR Code gerado - Escaneie para autenticar');
    qrcode.generate(qr, { small: true });
    fs.writeFileSync('qrcode.txt', qr);
});

client.on('authenticated', () => {
    log('Autenticação realizada com sucesso');
    if (fs.existsSync('qrcode.txt')) fs.unlinkSync('qrcode.txt');
});

client.on('auth_failure', msg => {
    log(`Falha na autenticação: ${msg}`);
    setTimeout(() => client.initialize(), 60000);
});

client.on('disconnected', reason => {
    log(`Desconectado: ${reason}`);
    log('Tentando reconectar...');
    client.initialize();
});

client.on('ready', () => {
    log('✅ Bot está online e operacional!');
});

client.on('message', async msg => {
    try {
        if (msg.from.endsWith('@g.us')) return;

        const phone = msg.from;
        const numero = phone.replace('@c.us', '');
        const text = msg.body.toLowerCase().trim();
        const name = (await msg.getContact()).pushname || 'Cliente';
        const isNewUser = !users[phone];

        salvarCliente(name, numero);

        // COMANDOS ADMIN
        if (numero === ADMIN_NUMBER.replace('+', '')) {
            if (text === '!clientes') {
                const lista = filtrarClientes('todos');
                await msg.reply(`📋 *TODOS OS CLIENTES (${lista.length})*\n\n${
                    lista.map(c => `👤 ${c.nome} - ${c.numero}`).join('\n') || "Nenhum cliente."
                }`);
                return;
            } else if (text.startsWith('!clientes ')) {
                const periodo = text.split(' ')[1];
                const periodosValidos = ['hoje', 'ontem', 'semana', 'mes', '3meses', '6meses', '1ano'];
                
                if (periodosValidos.includes(periodo)) {
                    const lista = filtrarClientes(periodo);
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
            users[phone] = { state: 'MENU' };
            await showMenu(msg);
            return;
        } else if (/^(menu|oi|ola|voltar|v)/.test(text)) {
            await msg.reply(`👋 Oi ${name}! Como posso te ajudar?`);
            users[phone] = { state: 'MENU' };
            await showMenu(msg);
            return;
        }

        switch (users[phone]?.state) {
            case 'MENU':
                await handleMenu(msg, text, phone, name);
                break;
            case 'WAITING_PAYMENT':
                await handlePayment(msg, text, phone);
                break;
            case 'WAITING_CONFIRMATION':
                await handleConfirmation(msg, text, phone);
                break;
        }
    } catch (error) {
        log(`Erro ao processar mensagem: ${error}`);
    }
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
        if (/^(1|comprar)/.test(text)) {
            users[phone] = { state: 'WAITING_PAYMENT' };
            await msg.reply(
                `💳 *FORMAS DE PAGAMENTO*\n\n` +
                `MPESA: 856429915\n` +
                `EMOLA: 868663198\n\n` +
                `Por favor, envie:\n` +
                `1. Comprovante de pagamento (foto ou texto)\n` +
                `2. Número para ativação\n\n` +
                `*Para voltar ao menu digite*: V ou voltar`
            );
        } 
        // ... (mantenha os outros casos do handleMenu originais)
    } catch (error) {
        log(`Erro no menu: ${error}`);
        await msg.reply(`❌ Ocorreu um erro. Tente novamente.`);
    }
}

// ====================== SERVIDOR EXPRESS ======================
const app = express();
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'online',
        whatsapp: client.info ? 'connected' : 'disconnected',
        uptime: process.uptime()
    });
});

// ====================== INICIALIZAÇÃO ======================
async function startBot() {
    try {
        if (!fs.existsSync(SESSION_DIR)) {
            fs.mkdirSync(SESSION_DIR, { recursive: true });
        }

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