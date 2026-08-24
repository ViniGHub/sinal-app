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
│   ├── chat/
│   │   ├── ChatPanel.tsx
│   │   └── types.ts         ChatMessage
│   └── channels/            canais salvos e presença do host
│       ├── storage.ts       bookmarks em localStorage, validados na leitura
│       ├── usePresence.ts   sondagem enquanto o painel está aberto
│       └── ChannelsPanel.tsx
├── shared/                  sem dono; serve a todos
│   ├── ui/                  BootScreen, ErrorBoundary
│   └── hooks/useCopy.ts
└── styles/                  tokens de design + reset global
```

### Canais

**Toda conexão acontece dentro de um canal.** Não existe conversa fora de um.
Há duas portas, e elas convergem:

| você abre | acontece |
|---|---|
| link de canal (`#channel=`) | entra nele; se estiver vazio, você o cria ao entrar |
| link pessoal (`#join=`) | pergunta à pessoa em que canal ela está — se ela não estiver em nenhum, ela cria um na hora |

`MeshSession.enter` é a única porta de entrada e decide qual caminho seguir a
partir do próprio ID. Por isso o prefixo `sinal-c-` é **funcional**, não
decorativo: entrar num canal vazio significa registrar o ID dele, e registrar o
ID de uma *pessoa* colidiria com o registro dela e forçaria a identidade dela a
rotacionar. Os dois tipos precisam ser distinguidos antes de qualquer
reivindicação.

O link pessoal nunca muda, então pode ser divulgado uma vez e reutilizado para
sempre — cada pessoa que o abrir cai num canal com você.

Um canal tem identidade própria: ele não é uma pessoa, e sobrevive à saída de
quem o criou.

O broker só conhece IDs de peer, e garante que cada um tem **um único dono**.
Essa unicidade é o truque inteiro: o canal *é* um ID de peer, e quem está
dentro dele disputa registrá-lo. Exatamente um ganha — o **âncora** — e os
demais o encontram discando o mesmo ID. Sem protocolo de eleição e sem
infraestrutura nova: o broker é o cadeado.

```
entrar no canal X
   │
   ├── registro X e consigo ──► virei o âncora (canal criado)
   │
   └── o broker diz ID-TAKEN ──► bato na porta ──► `members` ──► disco todos
```

Não existe passo de "criar": entrar num canal vazio *é* criá-lo.

**A ordem importa.** Tentar registrar responde na hora nos dois casos, porque o
servidor devolve `ID-TAKEN` imediatamente. Já discar um ID *vago* não devolve
nada até o servidor expirar a mensagem enfileirada, vários segundos depois — o
`peer-unavailable` do PeerJS vem só do `EXPIRE`. Bater na porta primeiro fazia
um canal vazio parecer morto, e ninguém virava âncora.

O âncora é um ponto de encontro, **nunca um relay** — ele entrega a lista de
membros e nada mais. Voz e tela continuam ponto a ponto. Quando o âncora sai, o
ID fica vago, os membros restantes correm por ele com atraso aleatório, e a sala
sobrevive.

[`ChannelAnchor`](src/features/channels/ChannelAnchor.ts) segura o segundo
`Peer`; [`MeshSession.joinChannel`](src/features/session/MeshSession.ts)
coordena bater na porta, discar os membros e reassumir a âncora.

### Moderação

Quem se chama **PohWay** vê um botão "remover do canal" em cada participante, e
também um × ao lado de cada nome na lista de ocupantes do painel — inclusive de
canais em que não está. Os demais só têm "sair do canal", para si mesmos.

A remoção à distância abre uma conexão de uso único, marcada para que o outro
lado não a transforme em participante: ser removido não deve, primeiro, colocar
quem removeu na sua tela. Como não há peer estabelecido nesse caso, a mensagem
carrega o nome de quem remove em vez de o receptor consultá-lo.

**Isto é uma convenção, não controle de acesso.** Nomes de exibição são
autodeclarados e trafegam pelo data channel sem verificação, então qualquer
pessoa pode digitar esse nome e ganhar o botão — e um cliente modificado pode
simplesmente ignorar o pedido de saída. Serve para tornar visível uma regra
entre pessoas que já confiam umas nas outras; não detém ninguém que não confie.

Controle real exigiria algo que um participante não possa simplesmente
declarar. O caminho mais simples aqui seria um segredo de administração fora do
link do canal: o convite carrega o canal, e um segundo segredo — combinado por
outro meio — acompanha as ações de moderação, que os demais só honram se o
segredo bater. Continua sendo confiança no cliente, mas deixa de bastar digitar
um nome.

### Atenção dos participantes

Compartilhar a tela sem saber se alguém está olhando é desconfortável, então
cada participante informa aos demais, pelo data channel, o estado da própria
aba. São dois sinais independentes do navegador, e eles respondem perguntas
diferentes:

| estado | o que o navegador diz | rótulo |
|---|---|---|
| `focused` | aba visível **e** com foco | na aba |
| `visible` | aba visível, janela sem foco | sem foco |
| `hidden` | aba em segundo plano ou minimizada | em outra aba |

O sinal é confiável **em uma direção só**: `hidden` prova que a pessoa *não*
está vendo a tela compartilhada; `focused` apenas diz que ela poderia estar —
a aba pode estar num segundo monitor para o qual ninguém olha. Os rótulos
falam de onde está a aba, nunca de onde estão os olhos.

Um peer de quem ainda não ouvimos nada fica `unknown` e não mostra nada. Supor
`focused` seria afirmar algo que não sabemos, exatamente no ponto em que o
usuário confia na informação.

### Nome do canal

O nome pertence ao canal, não ao seu marcador: renomear muda para todos, e quem
entra depois recebe o nome junto do handshake.

Duas pessoas podem renomear no mesmo instante, e aí a rede precisa convergir
sozinha. A regra é **último a escrever vence, com o ID do autor desempatando**
(`supersedesChannelName`). O desempate é o que torna seguro: sem ele, cada nó
ficaria com a mensagem que por acaso chegou por último, e a sala discordaria de
si mesma para sempre. Comparar IDs dá a mesma resposta em todos os nós,
independentemente da ordem de chegada.

Há um **cooldown de 3 minutos** por canal — depois que alguém renomeia, o nome
fica assentado para todo mundo, não só para quem mexeu. Como a moderação, é
cooperativo: evita o nome piscando entre pessoas de boa-fé, não um cliente
modificado.

Dois relógios são mantidos separados de propósito: o do autor, que só serve
para ordenar reivindicações, e o local, que mede o cooldown. Misturá-los faria
o relógio adiantado de um participante travar o botão dos outros.

### Câmera e tela

São **trilhas independentes**, não um seletor: dá para mostrar as duas ao mesmo
tempo. Cada uma viaja na sua própria chamada de mídia, distinguida por
`metadata.kind` (`'camera'` ou `'screen'`), com ciclo de vida próprio — ligar a
câmera não toca no compartilhamento de tela e vice-versa.

No bloco do participante, a tela ocupa o espaço e a câmera vira uma inserção no
canto; havendo só a câmera, ela ocupa o bloco inteiro. A própria câmera é
espelhada, como em qualquer app de vídeo.

A captura da câmera pede `audio: false` de propósito: a voz já trafega na
chamada de áudio, e pedir áudio aqui mandaria a todos uma segunda cópia dela.

**Expandir** oferece as três opções quando a pessoa tem tela e câmera: *ambos*
(câmera flutuando sobre a tela), *tela* ou *câmera*. Com um vídeo só não há o
que escolher, e o controle volta a ser um botão único.

A câmera flutuante é arrastável e **encaixa no canto mais próximo** ao soltar,
com as setas do teclado movendo entre cantos. Cantos em vez de coordenadas
livres porque um canto continua válido em qualquer tamanho de janela — a
inserção nunca acaba metade fora da tela depois de um redimensionamento, e a
posição guardada nunca aponta para um lugar inalcançável. Ela é lembrada entre
sessões.

Se a fonte em destaque some — a pessoa parou de compartilhar, ou desligou a
câmera — o destaque cai para a que sobrou, em vez de fechar e devolver o
espectador à grade.

### Trocar de microfone ou câmera

Um seletor ao lado de cada botão de captura lista o hardware disponível, e ele
some quando não há entre o que escolher.

A troca usa `replaceTrack` no `RTCRtpSender`, que muda o que um remetente
transmite **sem renegociar** — a chamada não cai e ninguém ouve um vão.
Rechamar cada peer com um stream novo derrubaria e reconstruiria cada conversa.

Três detalhes que essa troca exige: o estado de mudo é reaplicado à faixa nova,
que nasce habilitada, senão trocar de microfone tiraria alguém do mudo sem
querer; o dispositivo antigo só é liberado depois da troca, para que ele
continue vivo até o novo estar de fato carregando a chamada; e o `deviceId` vai
como `ideal`, não `exact`, porque um ID lembrado pode apontar para hardware
desconectado e é melhor cair no padrão do que não capturar nada.

Os rótulos dos dispositivos só ficam legíveis depois que a permissão
correspondente foi concedida, então a lista de câmeras aparece genérica
("Câmera 1", "Câmera 2") até a câmera ser ligada uma vez. As listas são
relidas em `devicechange` e a cada vez que uma captura começa ou para.

### Presença

O broker não tem endpoint de "esse ID está online?", então a única resposta
honesta vem de abrir um data channel e ver se ele completa —
[`MeshSession.probePeer`](src/features/session/MeshSession.ts). A conexão é
fechada assim que responde, e a sondagem carrega `metadata.probe` para que o
outro lado **não** a transforme em participante: sem isso, cada checagem
colocaria um bloco fantasma na tela de todo mundo na sala.

Para um canal, isso responde "tem alguém aí dentro?" em vez de "essa pessoa
está online?" — que é a pergunta que realmente importa.

A âncora responde com **quem** está dentro, e não só que está viva, então o
painel mostra os nomes de cada canal salvo sem precisar entrar nele. Uma
sondagem que abre mas não responde nada é uma pessoa, não um canal; ela espera
pouco mais de um segundo por essa lista antes de reportar apenas "ativo", em
vez de segurar o resultado até o timeout inteiro.

**Consequência de privacidade:** quem tem o ID de um canal enxerga quem está lá
dentro sem entrar e sem ser visto. O ID do canal é, na prática, a única
credencial que existe — trate o link como você trataria a senha da sala.

Só há sondagem com o painel aberto. Uma lista de favoritos não deve gerar
tráfego em segundo plano, e quem já está conectado é dado como ativo sem gastar
ida e volta.

### Diagnóstico

Num app ponto a ponto a falha costuma estar na máquina de outra pessoa, num
navegador que você não consegue abrir. `shared/diagnostics.ts` mantém um buffer
em anel do que a camada de conexão fez, e o link **diagnóstico** no rodapé abre
o registro em ordem, com um botão de copiar.

Esse botão é o motivo da coisa toda: transforma "não aparece ninguém" numa
transcrição que alguém consegue ler sem ter o navegador com defeito à mão.

Os IDs aparecem abreviados (`shortId`). Isso mantém os eventos correlacionáveis
sem que o log entregue o acesso a um canal — o ID do canal é, na prática, a
única credencial que existe.

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

### Configurando (Cloudflare Realtime)

O caminho recomendado usa credenciais **temporárias**, emitidas sob demanda pelo
Worker em [`worker/`](worker/). Nenhum segredo entra no bundle.

```
navegador ──► seu Worker ──► API da Cloudflare ──► iceServers com TTL
              (guarda a chave)
```

**1. Criar a chave** em *Cloudflare Dashboard → Realtime → TURN*. Guarde o
`TURN_KEY_ID` e o token.

**2. Publicar o Worker:**

```bash
cd worker
npx wrangler secret put TURN_KEY_ID
npx wrangler secret put TURN_KEY_API_TOKEN
npx wrangler deploy
```

Ajuste `ALLOWED_ORIGINS` no [`wrangler.toml`](worker/wrangler.toml) para os
domínios que podem pedir credenciais.

**3. Apontar o app** para a URL que o `deploy` imprimiu:

```bash
VITE_TURN_ENDPOINT=https://sinal-turn.SEU-SUBDOMINIO.workers.dev
```

Em produção, defina `TURN_ENDPOINT` em *Settings → Variables* — é só uma URL, não
um segredo. O workflow já a injeta no build.

Se o endpoint falhar ou demorar, o app **não quebra**: cai para os padrões do
PeerJS e a chamada segue sem TURN próprio, o que basta para a maioria das redes.
O evento aparece no painel de diagnóstico.

### Alternativa: TURN com credencial fixa

Ainda suportado, para um coturn próprio:

```bash
VITE_TURN_URLS=turn:turn.exemplo.dev:3478,turns:turn.exemplo.dev:5349
VITE_TURN_USERNAME=usuario
VITE_TURN_CREDENTIAL=senha
```

Os três precisam estar preenchidos — [`ice.ts`](src/features/session/ice.ts)
ignora um TURN pela metade de propósito, porque uma entrada que não autentica é
pior que nenhuma: o navegador tenta, falha e atrasa toda conexão.

Lembre que estes vão **para dentro do bundle** e são públicos. É exatamente por
isso que o endpoint é o caminho recomendado.

### Conferindo se o TURN funciona

```bash
VITE_ICE_FORCE_RELAY=true npm run dev
```

Isso proíbe caminhos diretos. Se a chamada conectar assim, o relay está certo;
se não conectar, o problema está no TURN e não na rede de quem testou. **Nunca
publique com essa variável ligada** — força 100% do tráfego pelo relay.

### Por que credenciais efêmeras

Tudo com prefixo `VITE_` é embutido no bundle. Uma senha fixa de TURN ali é uma
senha pública: qualquer pessoa abre o DevTools, copia e gasta sua cota.

É por isso que o Worker existe. A chave fica nele, o navegador só recebe
credenciais com prazo, e a `MeshSession` resolve isso **uma vez** no `start()` —
reusando a mesma configuração para toda conexão, inclusive as âncoras de canal,
em vez de emitir credenciais a cada uma.

Rodando um coturn próprio, o mesmo padrão existe via `use-auth-secret`: um
endpoint seu devolve `username = <expiração>:<usuário>` e
`credential = HMAC-SHA1(secret, username)` em base64. Basta apontar
`VITE_TURN_ENDPOINT` para ele, desde que responda no mesmo formato
(`{ iceServers: [...] }`).

## Limites conhecidos

- **Malha completa.** Cada participante mantém uma conexão com cada outro, o que
  é ótimo para latência e péssimo para banda: acima de ~6 pessoas o upload de
  quem compartilha a tela vira o gargalo. Grupos maiores pedem um SFU.
- **Broker público.** O servidor de sinalização gratuito do PeerJS não tem SLA.
- **Áudio da aba** só é capturado no Chromium, e apenas ao compartilhar uma aba.

## Licença

[MIT](LICENSE) — © 2026 Vinicius Rodrigues da Silva.

Use, modifique, forke e distribua à vontade, inclusive comercialmente; basta
manter o aviso de copyright. O software é fornecido sem garantia.
