# Sinal

Voz e compartilhamento de tela ponto a ponto entre navegadores. O áudio e o vídeo
vão direto de uma pessoa para a outra via WebRTC; só o endereço inicial passa por
um servidor público de sinalização (o broker gratuito do PeerJS).

## Rodando

```bash
npm install
npm run dev        # http://localhost:5173
```

Outros comandos:

| Comando | O que faz |
|---|---|
| `npm run build` | Type-check + bundle de produção em `dist/` |
| `npm run preview` | Serve o `dist/` para conferir o build |
| `npm run typecheck` | TypeScript em modo estrito, sem emitir |
| `npm run lint` | ESLint com regras type-aware |
| `npm test` | Vitest |

> WebRTC exige um contexto seguro. `localhost` conta como seguro; para testar de
> outro aparelho na rede, use HTTPS ou um túnel.

## Arquitetura

A regra central: **a lógica de conexão não conhece React, e os componentes não
conhecem WebRTC.**

Os arquivos são agrupados por **domínio**, não por tipo. Cada pasta em
`features/` reúne o componente, o hook e a lógica daquele assunto, de modo que
mexer no chat é abrir uma pasta em vez de caçar três.

```
src/
├── main.tsx                 entrada
├── app/                     raiz de composição — só monta as features
│   └── App.tsx
├── features/
│   ├── session/             conexão, sinalização, ciclo de vida
│   │   ├── MeshSession.ts   dona de todas as conexões, chamadas e streams
│   │   ├── protocol.ts      mensagens do data channel + validação
│   │   ├── ice.ts           STUN/TURN
│   │   ├── useMesh.ts       useSyncExternalStore sobre o snapshot
│   │   ├── SessionProvider.tsx, sessionContext.ts
│   │   ├── ConnectForm.tsx, StatusLine.tsx
│   │   └── types.ts         SessionStatus, MeshSnapshot
│   ├── identity/            quem você é e como te encontram
│   │   ├── storage.ts       ID estável e nome em localStorage
│   │   ├── invite.ts        link no fragmento da URL
│   │   └── IdentityCard.tsx
│   ├── participants/        quem está na sala
│   │   ├── PeerGrid.tsx, PeerTile.tsx, LocalPreview.tsx
│   │   └── types.ts         RemotePeer
│   ├── media/               microfone, tela e controles
│   │   ├── capture.ts       getUserMedia / getDisplayMedia
│   │   ├── useMediaStream.ts, useMicLevel.ts
│   │   └── ControlBar.tsx, MicMeter.tsx
│   └── chat/
│       ├── ChatPanel.tsx
│       └── types.ts         ChatMessage
├── shared/                  sem dono; serve a todos
│   ├── ui/                  BootScreen, ErrorBoundary
│   └── hooks/useCopy.ts
└── styles/                  tokens de design + reset global
```

### Convenção de imports

Dentro de uma feature, caminho relativo (`./protocol`). Entre features, o alias
`@/` (`@/features/session/useMesh`). A regra não é estética: o alias faz cada
dependência entre domínios saltar aos olhos na revisão, então acoplamento novo
é uma escolha visível em vez de um `../../` que passa batido.

Não há arquivos-barril (`index.ts`) de propósito. Como `session` depende dos
tipos de `participants` e `participants` depende do hook de `session`, barris
fechariam um ciclo de importação — os caminhos diretos evitam isso.

### MeshSession

Uma classe que expõe um par `subscribe` / `getSnapshot`. A cada mudança ela
reconstrói um `MeshSnapshot` imutável e avisa os assinantes; o React lê isso com
`useSyncExternalStore`. Isso significa que a sessão pode ser testada e depurada
sem montar um componente, e que nenhum componente guarda estado de conexão.

Comandos são métodos: `connectTo`, `disconnect`, `setMicMuted`, `setName`,
`toggleSharing`, `sendChat`.

### Como a malha se forma

Cada par de participantes mantém **um** data channel confiável, e é por ele que
passam o roster, o nome, o estado do microfone e o chat.

1. Você disca para alguém e envia `hello` com a lista de IDs que já conhece.
2. Quem recebe responde `roster` com a lista dela.
3. Cada lado disca para os IDs que ainda não conhecia.

Assim, entrar pelo link de uma pessoa conecta você a **todas** as outras — a
versão anterior formava uma estrela, em que dois convidados nunca se ouviam.

Quando os dois lados descobrem um ao outro no mesmo instante, quem disca é
decidido por `shouldInitiate` (comparação de IDs). Sem essa regra, ambos ligariam
e cada um ouviria o outro duas vezes. Se o lado que deveria discar não aparecer em
8 segundos, o outro assume e disca mesmo assim.

### Entrada não confiável

Tudo que chega pelo data channel foi escrito por um navegador que não
controlamos. `parseWireMessage` valida formato, tipo e tamanho antes que qualquer
coisa chegue à aplicação: IDs passam por regex, nomes e mensagens são truncados,
o roster tem teto e mensagens desconhecidas são descartadas em silêncio (em vez
de derrubar um cliente antigo quando o protocolo crescer).

O React escapa texto por padrão, o que fecha a injeção de HTML que existia quando
o ID do peer era concatenado em `innerHTML`.

## Deploy

`.github/workflows/deploy.yml` roda type-check, lint e testes; só então builda e
publica no GitHub Pages. `VITE_BASE` é preenchido com o caminho do repositório,
porque project pages ficam em `/<repo>/` e não na raiz.

## STUN e TURN

Sem configuração, valem os defaults do próprio PeerJS: STUN do Google mais um
TURN comunitário gratuito (`turn:eu-0.turn.peerjs.com`). Por isso
`buildPeerConfig` devolve `undefined` quando nada foi configurado — informar
`config` **substitui** o default inteiro em vez de somar a ele, e passar só
STUN derrubaria aquele relay gratuito, piorando o NAT traversal.

STUN só conta ao peer qual é o endereço público dele; a mídia continua indo
direto de um lado ao outro. Configurar qualquer variável abaixo assume o
controle total da lista, inclusive abrindo mão do TURN gratuito do PeerJS —
o que é o certo quando você tem o seu.

Quando não existe caminho direto (NAT simétrico, firewall corporativo, algumas
operadoras móveis), é preciso um **TURN**, que retransmite a mídia. Isso custa
banda de verdade: cada byte da chamada passa pelo seu servidor.

Configure copiando `.env.example` para `.env.local`:

```bash
VITE_TURN_URLS=turn:turn.exemplo.dev:3478,turns:turn.exemplo.dev:5349
VITE_TURN_USERNAME=usuario
VITE_TURN_CREDENTIAL=senha
```

Os três precisam estar preenchidos — [`lib/ice.ts`](src/lib/ice.ts) ignora um
TURN pela metade de propósito, porque uma entrada que não autentica é pior que
nenhuma: o navegador tenta, falha e atrasa toda conexão.

Em produção, defina `TURN_URLS` em *Settings → Variables* e `TURN_USERNAME` /
`TURN_CREDENTIAL` em *Settings → Secrets*; o workflow já os injeta no build.

### Conferindo se o TURN funciona

```bash
VITE_ICE_FORCE_RELAY=true npm run dev
```

Isso proíbe caminhos diretos. Se a chamada conectar assim, o relay está certo;
se não conectar, o problema está no TURN e não na rede de quem testou. **Nunca
publique com essa variável ligada** — força 100% do tráfego pelo relay.

### Credenciais efêmeras

Tudo com prefixo `VITE_` é embutido no bundle. Uma senha fixa de TURN ali é
pública: qualquer pessoa abre o DevTools, copia e usa sua banda.

Para uso além de amigos, o TURN deve emitir credenciais temporárias. O coturn
suporta isso com `use-auth-secret`: um endpoint seu devolve
`username = <expiração>:<usuário>` e `credential = HMAC-SHA1(secret, username)`
em base64, válidos por algumas horas. Aí o segredo fica no servidor, e o
front-end busca as credenciais em runtime em vez de recebê-las no build —
trocando a chamada a `buildPeerConfig` por um fetch antes de criar o `Peer`.

## Limites conhecidos

- **Malha completa.** Cada participante mantém uma conexão com cada outro, o que
  é ótimo para latência e péssimo para banda: acima de ~6 pessoas o upload de
  quem compartilha a tela vira o gargalo. Grupos maiores pedem um SFU.
- **Broker público.** O servidor de sinalização gratuito do PeerJS não tem SLA.
- **Áudio da aba** só é capturado no Chromium, e apenas ao compartilhar uma aba.
