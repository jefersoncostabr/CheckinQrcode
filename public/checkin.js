async function confirmar() {
    // Verifica se este dispositivo já salvou um check-in hoje
    if (localStorage.getItem('checkin_realizado')) {
        alert("Você já confirmou presença neste dispositivo!");
        return;
    }

    const nomeInput = document.getElementById('nomeInput');
    const nome = nomeInput.value.trim();

    if (!nome) {
        alert("Por favor, digite seu nome antes de confirmar.");
        return;
    }

    const btn = document.getElementById('btn');
    btn.disabled = true; btn.innerText = 'Registrando...';
    
    try {
        const res = await fetch('/add', { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome: nome })
        });
        const data = await res.json();
        if(data.sucesso) { 
            localStorage.setItem('checkin_realizado', 'true'); // Marca neste celular que já foi feito
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