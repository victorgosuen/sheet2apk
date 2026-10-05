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
