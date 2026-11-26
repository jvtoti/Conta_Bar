# 🎸 Violão Fácil

App web (PWA) para tocar acordes de violão pelo celular, com batidas prontas.

## Como usar

- **Acordes:** toque num acorde para selecioná-lo. Abas: ★ Meus, Maiores, Menores e Sétimas.
  - **Segure** um acorde para adicionar/remover da aba **★ Meus** (monte ali os acordes da sua música).
  - Toque no acorde grande do topo para ouvir uma palhetada.
- **Batidas:** **segure** Pop, Rock, Sertanejo, Reggae ou Personalizada para tocar; solte para parar.
  - Dá pra trocar de acorde com o outro dedo enquanto segura a batida.
  - **🔒 Travar:** em vez de segurar, um toque liga e outro desliga.
  - **⚡ BPM auto:** cada batida usa seu andamento sugerido. Mexer no − / + desliga o automático.
- **✎ Personalizada:** toque nos passos para trocar o golpe (↓ baixo, ↑ cima, ✕ abafado,
  ▾ curto de reggae, ● nota grave, ○ grave alternado, · pausa). 8 ou 16 passos, swing e BPM.
  Dá para copiar uma batida pronta como ponto de partida.

Tudo fica salvo no aparelho. O som é sintetizado (sem arquivos de áudio) e funciona offline.

## Rodar / publicar

São só arquivos estáticos. Para testar no computador:

```bash
cd violao && python3 -m http.server 8000
# abra http://localhost:8000
```

Para usar no celular, publique a pasta `violao/` em qualquer hospedagem estática com HTTPS
(GitHub Pages, Vercel, Netlify…). No celular, abra o link e use
"Adicionar à tela inicial" para instalar como app.

> iPhone: se não sair som, desligue o modo silencioso (chave lateral).
