// comentário teste(remover)

// Função para obter a data de hoje no formato YYYY-MM-DD
const getTodayString = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Extrai a sala da query string, ex: /add?sala=Sala%201
const salaAtual = new URLSearchParams(window.location.search).get('sala') || '';

// Atualiza o título na tela para indicar a sala
const tituloEl = document.querySelector('h1');
if (tituloEl) {
    tituloEl.textContent = salaAtual ? `Check-in - ${salaAtual}` : 'Check-in de Presença';
}

async function confirmar() {
    const storageKey = `checkin_realizado_${getTodayString()}`;
    // Verifica se este dispositivo já salvou um check-in na data de hoje
    if (localStorage.getItem(storageKey)) {
        alert("Você já confirmou presença neste dispositivo hoje!");
        return;
    }

    const nomeInput = document.getElementById('nomeInput');
    const nome = nomeInput.value.trim();

    if (!nome) {
        alert("Por favor, digite seu nome antes de confirmar.");
        return;
    }

    if (!salaAtual) {
        alert('Sala não especificada. Use o QR Code ou abra a página com ?sala=NomeDaSala.');
        return;
    }

    const btn = document.getElementById('btn');
    btn.disabled = true; btn.innerText = 'Registrando...';
    
    try {
        const res = await fetch('/add', { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome: nome, sala: salaAtual })
        });
        const data = await res.json();
        if(data.sucesso) { 
            localStorage.setItem(storageKey, 'true'); // Marca neste celular que já foi feito hoje
            btn.innerText = 'Presença Confirmada! ✅';
            btn.style.backgroundColor = '#28a745';
        } else { 
            alert(data.mensagem); 
            btn.disabled = false; btn.innerText = 'Tentar Novamente'; 
        }
    } catch (e) { 
        alert('Erro de conexão'); 
        btn.disabled = false; btn.innerText = 'Tentar Novamente'; 
    }
}