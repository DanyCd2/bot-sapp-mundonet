const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode-terminal');

// Configurações
const clientesFile = path.join(__dirname, 'clientes.json');
const ADMIN_NUMBER = '+258855337491'; // SEU NÚMERO (com código do país)
const imagePath = path.join(__dirname, 'p.png'); // Imagem da tabela de pacotes

// Controle de usuários (para fluxo de atendimento)
const users = {};

// Função para salvar clientes (ATUALIZADA)
function salvarCliente(nome, numero) {
    let clientes = [];

    // Verifica se o arquivo existe e tem conteúdo válido
    if (fs.existsSync(clientesFile)) {
        try {
            const fileContent = fs.readFileSync(clientesFile, 'utf-8');
            clientes = JSON.parse(fileContent);
            
            // Garante que clientes seja um array
            if (!Array.isArray(clientes)) {
                console.log("⚠️ Arquivo de clientes corrompido. Recriando...");
                clientes = [];
            }
        } catch (error) {
            console.log("⚠️ Erro ao ler clientes.json. Recriando...");
            clientes = [];
        }
    }

    // Verifica se o cliente já existe (evita duplicatas)
    const clienteJaExiste = clientes.some(cliente => cliente.numero === numero);
    
    if (!clienteJaExiste) {
        clientes.push({
            nome,
            numero,
            data: new Date().toISOString()
        });
        fs.writeFileSync(clientesFile, JSON.stringify(clientes, null, 2));
        console.log(`📝 Novo cliente salvo: ${nome} (${numero})`);
    }
}

// Função para filtrar clientes por período
function filtrarClientes(periodo) {
    if (!fs.existsSync(clientesFile)) return [];
    const clientes = JSON.parse(fs.readFileSync(clientesFile, 'utf-8'));
    const hoje = new Date();
    const umDia = 24 * 60 * 60 * 1000; // 1 dia em milissegundos

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
            default: return true; // Todos (sem filtro)
        }
    });
}

// Configuração do bot
const client = new Client({
    authStrategy: new LocalAuth({ dataPath: './session' }),
    puppeteer: { headless: true, args: ['--no-sandbox'] }
});

// Eventos do bot
client.on('qr', qr => qrcode.generate(qr, { small: true }));

client.on('ready', () => console.log('✅ Bot está online!'));

client.on('message', async msg => {
    // Ignora mensagens de grupos
    if (msg.from.endsWith('@g.us')) return;

    const phone = msg.from;
    const numero = phone.replace('@c.us', '');
    const text = msg.body.toLowerCase().trim();
    const name = (await msg.getContact()).pushname || 'Cliente';
    const isNewUser = !users[phone];

    // Salva automaticamente qualquer contato que enviar mensagem
    salvarCliente(name, numero);

    // COMANDOS ADMIN (apenas para seu número)
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

    // FLUXO DE ATENDIMENTO AUTOMÁTICO (para todos os usuários)
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
            if (msg.hasMedia || /(transferi|paguei|confirmado|id de transação|saldo)/i.test(text)) {
                await msg.reply(
                    `🔄 *Pagamento em verificação!*\n\n` +
                    `Estamos confirmando seu pagamento.\n` +
                    `Aguarde até receber seu pacote.\n\n` +
                    `Obrigado por escolher a MUNDO NET! 💖\n\n` +
                    `*Para voltar ao menu digite*: V ou voltar`
                );
                users[phone].state = 'WAITING_CONFIRMATION';
            } else if (/^(voltar|v|menu)/.test(text)) {
                users[phone] = { state: 'MENU' };
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
            } else if (/^(voltar|v|menu)/.test(text)) {
                users[phone] = { state: 'MENU' };
                await showMenu(msg);
            }
            break;
            
        case 'HUMAN_SUPPORT':
            // Não responde por 24h
            return;
    }
});

// Funções do menu (como no seu código original)
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
    switch (true) {
        case /^(1|comprar)/.test(text):
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
            users[phone] = { state: 'HUMAN_SUPPORT' };
            await msg.reply(
                `👨‍💼 *ATENDIMENTO HUMANO*\n\n` +
                `Você será atendido em até *24 horas*.\n\n` +
                `⚠️ O bot *não responderá* mensagens neste período.`
            );
            break;

        case /^(7|sair)/.test(text):
            users[phone] = { state: 'ACTIVE' };
            await msg.reply(
                `🔓 *Modo automático desativado*\n\n` +
                `Agora responderei normalmente às mensagens.\n\n` +
                `*Para voltar ao menu digite*: V ou voltar`
            );
            break;

        default:
            await msg.reply(
                `❌ Opção inválida, ${name}!\n\n` +
                `*Para voltar ao menu digite*: V ou voltar`
            );
    }
}

client.initialize();

// Mantém o bot ativo (opcional)
require('express')()
    .get('/', (req, res) => res.send('Bot ativo'))
    .listen(3000);