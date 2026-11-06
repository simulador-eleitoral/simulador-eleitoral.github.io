# Simulador de Federações Partidárias – Eleições 2026

Site público e gratuito (GitHub Pages) que:

1. mostra as federações partidárias reais de 2026 e deixa o visitante montar novas;
2. refaz as chapas de **deputado federal, estadual e distrital das 27 UFs**, eliminando os candidatos menos votados quando a nova agremiação passa do limite legal (vagas + 1);
3. recalcula toda a distribuição de cadeiras com os votos reais do TSE: quociente eleitoral, quociente partidário, piso individual de 10% do QE, sobras com a regra 80/20 e a última etapa entre todos os partidos (decisão do STF);
4. compara ganhos e perdas de cada partido ou federação com o resultado real, por UF e por candidato;
5. confere se o próprio motor de cálculo reproduz os eleitos oficiais.

> Este guia supõe que você nunca programou. Siga as etapas na ordem. Onde aparecer uma caixa cinza com um comando, **copie e cole o comando no terminal** e aperte Enter.

---

## Como o sistema funciona (em 30 segundos)

```
TSE (dados abertos) ──► scripts/preparar_dados.py ──► docs/data/2026/*.json ──► site (docs/) no GitHub Pages
                         roda no SEU computador         arquivos pequenos          todo o cálculo acontece
                         ou no GitHub (botão)           (poucos MB)                no navegador do visitante
```

**Por que o site não consulta o TSE "ao vivo"?** Os arquivos do TSE têm centenas de megabytes e o servidor do TSE não permite que outros sites os leiam diretamente pelo navegador. Por isso, o script baixa os dados pela API do Portal de Dados Abertos uma vez, resume tudo em arquivos leves e o site trabalha com eles. Quando o TSE atualizar algo, basta rodar o script de novo.

---

## Etapa 1 – Instale os programas (uma vez só)

| Programa | Para quê | Onde baixar |
|---|---|---|
| **VS Code** | editor onde você vai trabalhar | https://code.visualstudio.com |
| **Git** | envia os arquivos para o GitHub | https://git-scm.com/downloads |
| **Python 3** | roda o script que baixa os dados | https://www.python.org/downloads |
| Node.js (opcional) | roda os testes automáticos | https://nodejs.org (versão LTS) |

Cuidados na instalação (Windows):
- **Python:** na primeira tela do instalador, marque a caixa **"Add python.exe to PATH"** antes de clicar em *Install Now*. Isso é essencial.
- **Git:** pode aceitar todas as opções padrão (é só ir clicando em *Next*).
- Depois de instalar tudo, **reinicie o computador**.

No Mac, o Python e o Git podem já existir; se o terminal pedir para instalar as "ferramentas de linha de comando", aceite.

## Etapa 2 – Crie sua conta no GitHub

1. Acesse https://github.com e clique em **Sign up**. Escolha um nome de usuário (ele vai aparecer no endereço do site: `https://SEU-USUARIO.github.io/...`).
2. Confirme o e-mail.

## Etapa 3 – Coloque o projeto no seu computador

1. Descompacte o arquivo `simulador-federacoes.zip` (botão direito → *Extrair tudo*) dentro de **Documentos**.
2. Abra o VS Code → menu **File (Arquivo) → Open Folder (Abrir Pasta)** → escolha a pasta `simulador-federacoes`. Se aparecer "Do you trust the authors?", clique em **Yes, I trust**.
3. Abra o terminal dentro do VS Code: menu **Terminal → New Terminal**. Uma janela aparece na parte de baixo. Todos os comandos deste guia são digitados ali.

Teste se o Python está funcionando:

```
python --version
```

Deve aparecer algo como `Python 3.12.x`. Se aparecer erro, tente `py --version` (e, nesse caso, use `py` no lugar de `python` em todos os comandos abaixo). No Mac, use `python3`.

## Etapa 4 – Baixe os resultados de 2026 do TSE

```
python scripts/preparar_dados.py
```

O que acontece:
- O script consulta a API do Portal de Dados Abertos do TSE e baixa 5 arquivos (votação por candidato, votação por partido, comparecimento/brancos/nulos, vagas e cadastro de candidatos). São **algumas centenas de MB**; pode levar de 5 a 30 minutos, conforme sua internet.
- Os ZIPs ficam na pasta `dados_brutos/` (ela **não** vai para o GitHub).
- No final aparece `Pronto! 27 UFs, ... partidos, ... federações.` e os arquivos são gravados em `docs/data/2026/`.

Se a internet cair, rode o mesmo comando de novo: o que já foi baixado não é baixado outra vez.

**Se o download falhar** (o site do TSE às vezes fica fora do ar): entre em https://dadosabertos.tse.jus.br, procure o conjunto **"Resultados 2026"** e baixe manualmente `votacao_candidato_munzona_2026.zip`, `votacao_partido_munzona_2026.zip` e `detalhe_votacao_munzona_2026.zip`; no conjunto **"Candidatos 2026"**, baixe `consulta_cand_2026.zip` e `consulta_vagas_2026.zip`. Coloque todos na pasta `dados_brutos` e rode:

```
python scripts/preparar_dados.py --sem-download
```

## Etapa 5 – Veja o site funcionando no seu computador

```
python -m http.server 8000 --directory docs
```

Abra o navegador em **http://localhost:8000**. Para parar o servidor, clique no terminal e aperte `Ctrl + C`.

> Abrir o `index.html` com dois cliques **não funciona**: o navegador bloqueia a leitura dos dados quando o arquivo é aberto direto do disco. Use sempre o comando acima.

Confira na aba **Metodologia** a linha *"o simulador reproduz exatamente os eleitos oficiais em X de 54 disputas"*. O esperado é 54 de 54 (27 bancadas federais + 26 assembleias + Câmara Legislativa do DF). Se houver diferenças, a tabela mostra onde. Normalmente são candidaturas sub judice.

**Quer testar antes de baixar os dados reais?** Gere dados fictícios no formato do TSE:

```
python tests/gerar_dados_ficticios.py
python scripts/preparar_dados.py --pasta-zips dados_ficticios --sem-download --saida docs/data/exemplo
```

E abra **http://localhost:8000/?dados=exemplo** (aparece uma faixa vermelha "DADOS FICTÍCIOS").

## Etapa 6 – Publique no GitHub

Primeiro, informe seu nome e e-mail ao Git (uma vez só):

```
git config --global user.name "Seu Nome"
git config --global user.email "seu-email@exemplo.com"
```

Depois, no VS Code:

1. Clique no ícone **Source Control** na barra lateral esquerda (parece um galho com três bolinhas) ou aperte `Ctrl + Shift + G`.
2. Clique em **Initialize Repository**.
3. Na caixa "Message", escreva `Primeira versão` e clique em **Commit**. Se perguntar sobre "stage all changes", responda **Yes** (ou *Always*).
4. Clique em **Publish Branch**. O VS Code vai pedir para entrar na sua conta do GitHub: autorize no navegador.
5. Escolha **Publish to GitHub public repository** e mantenha o nome `simulador-federacoes`.

No plano gratuito, o GitHub Pages só funciona com repositório **público**.

## Etapa 7 – Ligue o GitHub Pages

1. Abra `https://github.com/SEU-USUARIO/simulador-federacoes` no navegador.
2. Clique em **Settings** (engrenagem, no topo) → no menu da esquerda, **Pages**.
3. Em *Build and deployment → Source*, escolha **Deploy from a branch**.
4. Em *Branch*, escolha **main** e a pasta **/docs**. Clique em **Save**.
5. Espere 1 a 3 minutos e recarregue a página. Aparece o endereço do site:
   **`https://SEU-USUARIO.github.io/simulador-federacoes/`**

Pronto: o simulador está no ar para qualquer pessoa.

## Etapa 8 – Como atualizar depois

**Mudou algo no código ou rodou o script de novo?** No VS Code: Source Control → escreva uma mensagem → **Commit** → **Sync Changes**. O site se atualiza sozinho em 1 a 2 minutos.

**Atualizar os dados sem usar o seu computador:** no GitHub, aba **Actions** → clique em **Atualizar dados do TSE** → **Run workflow**. O GitHub baixa os dados, roda os testes e salva os novos arquivos. (Se o TSE bloquear os servidores do GitHub, que ficam fora do Brasil, use o caminho pelo seu computador.) Depois, no VS Code, clique em **Sync Changes** para trazer os dados novos para a sua cópia.

---

## Estrutura dos arquivos

```
simulador-federacoes/
├── docs/                      ← tudo que vira o site
│   ├── index.html
│   ├── css/estilo.css
│   ├── js/calculo.js          ← regras eleitorais (QE, QP, 10%, sobras, cortes de chapa)
│   ├── js/dados.js
│   ├── js/app.js              ← telas do site
│   └── data/2026/             ← criado pelo script (index.json + um arquivo por UF)
├── scripts/
│   ├── preparar_dados.py      ← baixa e resume os dados do TSE
│   └── conferir.mjs           ← compara o recálculo com os eleitos oficiais
├── tests/
│   ├── teste_calculo.mjs      ← testes das regras com casos calculados à mão
│   └── gerar_dados_ficticios.py ← dados de teste + implementação de referência em Python
└── .github/workflows/atualizar-dados.yml ← botão "Atualizar dados do TSE"
```

Testes (precisa do Node.js): `node --test tests/teste_calculo.mjs` e `node scripts/conferir.mjs`.

## Regras aplicadas

| Etapa | Regra | Fonte |
|---|---|---|
| Votos válidos | nominais válidos + legenda; brancos, nulos e anulados ficam fora | Lei 9.504/97, art. 5º |
| Limite da chapa | até vagas + 1 candidatos por partido ou federação | Lei 9.504/97, art. 10 |
| Cota de gênero (opcional no corte) | mínimo de 30% de cada sexo | Lei 9.504/97, art. 10, §3º |
| Quociente eleitoral | válidos ÷ vagas; fração ≤ 0,5 desprezada, > 0,5 arredonda para cima | Código Eleitoral, art. 106 |
| Quociente partidário | votos da agremiação ÷ QE, sem fração | CE, art. 107 |
| Eleitos pelo QP | em ordem de votação, só quem tem ≥ 10% do QE | CE, art. 108 |
| Sobras – 1ª etapa | maiores médias entre agremiações com ≥ 80% do QE e candidato com ≥ 20% do QE | CE, art. 109, I, II e §2º |
| Sobras – 2ª etapa | maiores médias entre **todas** as agremiações | CE, art. 109, III, conforme STF (ADIs 7228, 7263, 7325) |
| Empate entre candidatos | o mais idoso | CE, art. 110 |
| Federação | conta como um único partido | Lei 9.096/95, art. 11-A |
| Cláusula de desempenho (exibida) | 2,5% dos válidos em ≥ 9 UFs com 1,5% em cada, ou 13 deputados em ≥ 9 UFs | EC 97/2017 |
