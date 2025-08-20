# Watcher Overlay (Electron)

Requisitos implementados:
- Janela tela cheia, transparente, sempre no topo (always-on-top)
- Corpo principal totalmente transparente, com regiões interativas autorizadas
- Click-through para clicar em outras aplicações, com exceções (taskbar superior + área do dashboard)
- Barra de tarefas superior auto-hide, com pequena aba/handle para reabrir ao passar o mouse
- `webview` que carrega um painel HTML+JS com:
  - Agenda (placeholder com campos de API Key/Client ID e mock de eventos)
  - ChatGPT (consulta via API da OpenAI)
  - Configurações (opacidade, always-on-top)
  - Espaço para assistente de trading

## Rodando

1. Instale dependências (Node >= 18):

```bash
cd /home/jthomazinho/data/watcher
npm install
```

2. Inicie em desenvolvimento:

```bash
npm run dev
```

A aplicação abre em tela cheia, transparente e sempre no topo.

## Observações

- Click-through é controlado no renderer com detecção de ponteiro. Quando fora das áreas interativas, os cliques passam "através" para outras janelas.
- Em Linux com alguns WMs, transparência/always-on-top pode variar. Testado com Electron 28.
- Para Google Calendar real, adicione o script do `gapi` e implemente OAuth (Authorization Code com PKCE) ou use um backend para tokens. O arquivo `public/dashboard.html` já tem campos e placeholder.
- Para ChatGPT, informe sua OpenAI API Key no campo correspondente. 