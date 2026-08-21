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

```
src/
├── lib/              núcleo, sem React
│   ├── mesh.ts       MeshSession — dona de todas as conexões, chamadas e streams
│   ├── protocol.ts   mensagens do data channel + validação de entrada não confiável
│   ├── media.ts      getUserMedia / getDisplayMedia
│   ├── identity.ts   ID estável e nome, persistidos em localStorage
│   ├── invite.ts     link de convite no fragmento da URL
│   └── types.ts      tipos de domínio (o que a UI enxerga)
├── hooks/            a ponte entre o núcleo e o React
│   ├── useMesh.ts    useSyncExternalStore sobre o snapshot da sessão
│   ├── useMediaStream.ts, useMicLevel.ts, useCopy.ts
│   └── sessionContext.ts
├── components/       só apresentação; recebem dados, disparam comandos
└── styles/           tokens de design + reset global
```

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

## Limites conhecidos

- **Sem servidor TURN.** Duas pontas atrás de NAT simétrico não fecham conexão.
  Resolver isso exige hospedar um TURN (coturn) e passar `config.iceServers`
  ao construir o `Peer` em `lib/mesh.ts`.
- **Malha completa.** Cada participante mantém uma conexão com cada outro, o que
  é ótimo para latência e péssimo para banda: acima de ~6 pessoas o upload de
  quem compartilha a tela vira o gargalo. Grupos maiores pedem um SFU.
- **Broker público.** O servidor de sinalização gratuito do PeerJS não tem SLA.
- **Áudio da aba** só é capturado no Chromium, e apenas ao compartilhar uma aba.
