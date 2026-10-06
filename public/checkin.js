// comentário teste(remover)

// Função para obter a data de hoje no formato YYYY-MM-DD
const getTodayString = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// QRs novos usam id; o apelido fica aceito para QRs antigos.
const parametros = new URLSearchParams(window.location.search);
const salaIdAtual = parametros.get('id');
const salaLegada = parametros.get('sala');
const salaAtual = salaIdAtual || salaLegada || '';

const tituloEl = document.querySelector('h1');
const salaStatus = document.getElementById('salaStatus');
const nomeInput = document.getElementById('nomeInput');
const btn = document.getElementById('btn');

async function validarSala() {
    if (!salaAtual) {
        salaStatus.textContent = 'Sala não cadastrada. Fale com a administração.';
        return;
    }
    try {
        const parametro = salaIdAtual ? 'id' : 'sala';
        const response = await fetch(`/api/checkin/sala?${parametro}=${encodeURIComponent(salaAtual)}`);
        const data = await response.json();
        if (!response.ok) {
            salaStatus.textContent = data.mensagem || 'Sala não cadastrada. Fale com a administração.';
            return;
        }
        tituloEl.textContent = `Check-in - ${data.sala.nome}`;
        salaStatus.textContent = 'Confirme sua presença.';
        nomeInput.disabled = false;
        btn.disabled = false;
    } catch {
        salaStatus.textContent = 'Não foi possível verificar a sala. Tente novamente.';
    }
}

async function confirmar() {
    const storageKey = `checkin_realizado_${salaAtual}_${getTodayString()}`;
    // Verifica se este dispositivo já salvou um check-in na data de hoje
    if (localStorage.getItem(storageKey)) {
        alert("Você já confirmou presença neste dispositivo hoje!");
        return;
    }

    const nome = nomeInput.value.trim();

    if (!nome) {
        alert("Por favor, digite seu nome antes de confirmar.");
        return;
    }

    if (!salaAtual) {
        alert('Sala não especificada. Fale com a administração.');
        return;
    }

    btn.disabled = true; btn.innerText = 'Registrando...';
    
    try {
        const res = await fetch('/add', { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(salaIdAtual ? { nome, salaId: Number(salaIdAtual) } : { nome, sala: salaLegada })
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

validarSala();