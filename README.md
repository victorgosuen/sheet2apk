# 📱 Sheet2APK — Conversor de Google Planilhas Web App para APK Android

Sistema completo e **100% gratuito** para converter Web Apps do **Google Apps Script / Google Planilhas** em aplicativos nativos **Android (.APK)** prontos para instalar no celular.

---

## ⚡ Como Funciona a Arquitetura Gratuita?

```
[ Usuário no Site ]
        │  (Informa Nome, URL da Planilha e envia o Ícone)
        ▼
[ Cloudflare Pages + Functions ]  (Hospedagem 100% Grátis)
        │  (Aciona o compilador via API)
        ▼
[ GitHub Actions ]  (Compilador Gradle Nativo com 7GB RAM)
        │  (Injeta a URL, redimensiona os ícones e compila o APK)
        ▼
[ APK Pronto ]
        ├── Download Direto (.apk)
        └── QR Code para escanear com a câmera do celular
```

---

## 🚀 Como Testar Imediatamente no seu Computador

Você não precisa instalar nada além do Node.js (que já está instalado na sua máquina):

1. Abra o terminal nesta pasta:
   ```bash
   node server.js
   ```
2. Abra o navegador em:
   ```
   http://localhost:3000
   ```
3. No topo direito do site, clique no ícone de **engrenagem ⚙️** para inserir seu repositório GitHub e o token de acesso.

---

## 🛠️ Passo a Passo para Publicar (100% Grátis)

### Passo 1: Criar o Repositório no GitHub
1. Acesse [github.com](https://github.com) e crie um novo repositório (pode ser **Público** para minutos de compilação ilimitados ou **Privado** com 2.000 minutos grátis por mês).
2. Nomeie o repositório como desejar (ex: `sheet2apk`).
3. Suba todos os arquivos desta pasta para o repositório.

### Passo 2: Criar o Token de Acesso do GitHub (Personal Access Token)
O Cloudflare precisa de permissão para iniciar o compilador no GitHub:
1. No GitHub, clique na sua foto de perfil (canto superior direito) > **Settings**.
2. No menu lateral esquerdo, role até o final e clique em **Developer Settings**.
3. Clique em **Personal access tokens** > **Tokens (classic)** > **Generate new token (classic)**.
4. Dê um nome (ex: `Sheet2APK Compiler`).
5. Marque as caixas:
   - `repo` (Acesso completo a repositórios privados/públicos)
   - `workflow` (Permissão para disparar workflows do GitHub Actions)
6. Clique em **Generate token** e copie o código gerado (`ghp_...`).

### Passo 3: Ativar Permissões de Escrita no Repositório
No repositório que você criou:
1. Acesse a aba **Settings** > **Actions** > **General**.
2. Role até a seção **Workflow permissions**.
3. Selecione **Read and write permissions** (para que o robô possa anexar o `.apk` na aba de Releases).
4. Clique em **Save**.

### Passo 4: Publicar no Cloudflare Pages (100% Grátis)
1. Crie uma conta gratuita em [dash.cloudflare.com](https://dash.cloudflare.com).
2. No menu lateral, vá em **Workers e Pages** > **Criar aplicativo** > Aba **Pages** > **Conectar ao Git**.
3. Selecione a sua conta do GitHub e o repositório `sheet2apk`.
4. Em **Configurações de compilação**:
   - Predefinição de framework: `Nenhum`
   - Diretório de saída da compilação: `public`
5. Na seção **Variáveis de ambiente (Avançado)**, adicione:
   - `GITHUB_REPO`: `seu-usuario/nome-do-repositorio`
   - `GITHUB_TOKEN`: o token `ghp_...` que você copiou no Passo 2
6. Clique em **Salvar e Implantar**.

Pronto! Em 30 segundos seu site estará no ar com link seguro `https://seu-projeto.pages.dev` e certificado SSL gratuito.

---

## 📋 Como Obter o Link Correto da sua Planilha Google

Para que seu Web App funcione sem exigir tela de login de contas Google:

1. Abra sua planilha no Google Drive.
2. No menu superior, clique em **Extensões** > **Apps Script**.
3. No canto superior direito da tela do Apps Script, clique no botão azul **Implantar** > **Nova Implantação**.
4. Clique no ícone de engrenagem e selecione **App da Web**.
5. Configure as opções:
   - **Executar como:** *Eu (seu e-mail)*
   - **Quem pode acessar:** *Qualquer pessoa (Anyone)* *(Obrigatório!)*
6. Clique em **Implantar** e copie a URL que termina com `/exec`.

---

## 📱 Recursos Especiais da WebView Android Inclusa

- **Upload de Fotos e Documentos:** Suporte nativo ao seletor de arquivos do Android (`onShowFileChooser`).
- **Download de Arquivos:** Suporte a download de exportações de planilhas em PDF, Excel (.xlsx) e CSV.
- **Prevenção do Erro `disallowed_useragent`:** Configuração de User-Agent personalizada para compatibilidade com serviços Google.
- **Navegação com Botão Voltar:** O botão voltar do Android navega pelas páginas internas do Web App em vez de fechar o aplicativo imediatamente.
- **Tela Amigável Offline:** Caso o celular perca sinal de internet, exibe mensagem clara e botão "Tentar Novamente".


## Preparação de pastas web

O modo diretório usa uma origem HTTPS local na raiz (`https://appassets.androidplatform.net/index.html`). Isso mantém caminhos absolutos e relativos, JSON, módulos, workers e service workers na mesma origem. Arquivos ausentes retornam 404; requisições a servidores externos continuam sob as regras de CORS desses servidores.

Projetos com `package.json` e script `build` são compilados no GitHub Actions com Node 24 (`npm ci` quando existe package-lock.json; senão, `npm install`, seguido de `npm run build`). A saída antiga de dist/build/out é descartada. HTML estático e distribuições já compiladas sem script build também são aceitos. A preparação falha quando recebe apenas código de desenvolvimento ou uma saída sem index.html.

A saída estática é procurada em dist, build e out. Para outro diretório, inclua `.sheet2apk/config.json`:

```json
{"web_dir": "caminho/da/saida"}
```

Os scripts de build precisam gerar todos os dados usados pelo aplicativo. Arquivos públicos devem estar na distribuição final; não são substituídos automaticamente por arquivos antigos de outras pastas. Aplicações que precisam de Node/PHP, SSR, APIs ou bancos no servidor precisam manter esses serviços hospedados; empacotar uma pasta não cria um servidor Android.

A localização padrão usa `navigator.geolocation.getCurrentPosition` e `watchPosition`. A WebView responde ao pedido somente depois do resultado da permissão Android, aceitando também localização aproximada. AndroidBridge permanece como compatibilidade para aplicativos antigos. GPS real ainda depende da autorização e da localização ativada no aparelho. Câmera e microfone também verificam a autorização Android antes de conceder acesso web.

Validação sem gerar APK: `python scripts/test_web_assets.py`.


### Dependências de workers e módulos

A preparação verifica imports relativos nos módulos JavaScript antes de empacotar. Alguns bundlers copiam arquivos com `?url` sem incluir os módulos que esses arquivos importam. Quando o arquivo copiado corresponde exatamente a um módulo instalado em node_modules, o conversor inclui suas dependências relativas recursivamente. Se não consegue identificar a dependência com segurança, interrompe a preparação com o nome do arquivo ausente. Para uma distribuição incompleta sem código-fonte, envie a pasta inteira do projeto para recompilar.

Regressão verificada em 07/10/2026: os arquivos do APK publicado do •MAPA continham um worker que importava `./maplibre-gl-shared.mjs`, mas esse módulo não estava no pacote. No navegador, a distribuição original mostrava a precisão do GPS simulado e nenhuma parada, com erro `Worker failed to load`. Após a inclusão da dependência, as camadas das 3.263 paradas e o marcador da posição simulada voltaram a renderizar sem esse erro. Este teste usou os arquivos de um APK existente; não gerou outro APK nem verificou o GPS físico de um aparelho.
