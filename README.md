# MozRural · Sistema de Monitoria e Avaliação

Plataforma web estática, hospedada no **GitHub Pages**, com os mesmos indicadores e a mesma organização do dashboard Power BI do MozRural/PERS. Os dados vêm de um **Google Sheet**.

**O que inclui:**

- **Dashboard público.** Inclui:
  - página Início com três separadores: Descrição, Indicadores Programáticos e Resumo (matriz anual);
  - ODP (Fase 1) e Componentes 1 a 5;
  - para cada indicador: separadores e sub-separadores de desagregação (mulheres, jovens, províncias…), medidor de alcance, gráfico Meta vs Realizado e tabela.
- **Exportação do relatório completo em PDF**, com:
  - capa e ficha do projecto;
  - indicadores programáticos;
  - matriz anual colorida;
  - uma secção por componente, com o gráfico e a tabela de cada indicador.
- **Área "Actualizar dados" trancada.** Só entra quem tiver permissão de **Editor** no Google Sheet. Cada entrada e cada alteração ficam registadas.
- Filtro por **ano de referência**, exportação da matriz em CSV, modo escuro e versão móvel.

---

## 1. Estrutura dos ficheiros

```
index.html              página única da aplicação
config.js               ← o único ficheiro que precisa de editar
assets/css/styles.css
assets/js/data.js       leitura do Google Sheet e cálculos
assets/js/app.js        páginas e navegação
assets/js/charts.js     gráficos e medidores
assets/js/pdf.js        relatório PDF
assets/js/editor.js     área protegida de actualização
assets/vendor/          bibliotecas incluídas (sem depender de CDN)
dados-exemplo/*.csv     dados usados enquanto o Google Sheet não estiver ligado
modelo/MozRural_ME_GoogleSheet.xlsx   modelo para criar o Google Sheet
```

Sem `SHEET_ID` configurado, o site funciona com os dados de exemplo. Pode publicá-lo já e ligar o Google Sheet depois.

---

## 2. Criar o Google Sheet

1. Abra o Google Drive e carregue o ficheiro `modelo/MozRural_ME_GoogleSheet.xlsx`.
2. Abra-o e escolha **Ficheiro → Guardar como Google Sheets**. A partir daqui, use a versão Google Sheets.
3. Copie o **ID** do ficheiro, que é a parte do link entre `/d/` e `/edit`:
   `https://docs.google.com/spreadsheets/d/`**`1AbCdEf...xyz`**`/edit`
4. Configure a partilha (botão **Partilhar**):
   - **Acesso geral:** "Qualquer pessoa com o link" → **Leitor**. Isto permite que o dashboard público leia os dados.
   - **Pessoas:** adicione como **Editor** apenas quem pode actualizar os indicadores.

> ⚠️ Nunca escolha "Qualquer pessoa com o link → **Editor**". Isso desactivaria a protecção.

### Folhas do Google Sheet

Não mude os nomes das folhas nem os cabeçalhos da linha 1.

| Folha | Conteúdo |
|---|---|
| **Projecto** | Pares `chave` / `valor`: nome, objectivo, orçamento, área de implementação… A chave `actualizacao` é preenchida automaticamente. |
| **Componentes** | Menu lateral. `id` (PRI, ODP, C1…C5), `ordem`, `nome`, `descricao`, `estado` (`activo` ou `brevemente`). |
| **Indicadores** | Um indicador por linha. Ver as colunas na tabela seguinte. |
| **Dados** | Uma linha por indicador e por ano: `codigo`, `ano`, `meta`, `realizado`, `nota`. |
| **Locais** | Opcional. Pontos no mapa de um indicador: `codigo`, `nome`, `tipo`, `distrito`, `latitude`, `longitude`. |
| **Historico** | Preenchida pela plataforma: quem alterou o quê, quando, e os valores antes e depois. |
| **Acessos** | Preenchida pela plataforma: registo de cada entrada na área de actualização. |

Colunas da folha **Indicadores**:

| Coluna | Significado |
|---|---|
| `codigo` | Código do indicador (ex.: IRI 1.1). |
| `componente` | `id` do componente a que pertence. |
| `pai` | Código do indicador principal, quando a linha é uma desagregação (mulheres, jovens, províncias…). |
| `nome`, `descricao`, `unidade`, `responsavel` | Texto apresentado no dashboard e no PDF. |
| `meta_final` | Opcional. Meta final do projecto. |
| `agregacao` | Regra de cálculo do alcance (ver abaixo). |

Na folha **Dados**, deixe o **realizado vazio** quando ainda não houver medição. Um **0** significa que foi medido e o resultado é zero.

### Como é calculado o "alcance geral"

A coluna `agregacao` de cada indicador define a regra:

| Valor | Cálculo |
|---|---|
| `ultimo` (padrão) | Último valor reportado ÷ meta desse ano. Indicado para valores acumulados ou percentagens, que são a maioria. |
| `acumulado` | Soma dos valores anuais ÷ meta final (ou soma das metas). |
| `media` | Média dos valores anuais ÷ média das metas. |

> No Power BI original, os medidores somavam todos os anos, o que dava percentagens como 709%. Aqui, por omissão, usa-se o último valor reportado, que coincide com a matriz "Resumo" do Power BI.

Os limiares de estado (Atingido ≥ 100%, Em curso ≥ 70%, Atrasado < 70%) podem ser alterados em `config.js`.

---

## 3. Publicar no GitHub Pages

1. Crie um repositório no GitHub (ex.: `mozrural-me`).
2. Carregue **todo o conteúdo desta pasta**, mantendo as subpastas: **Add file → Upload files**, ou `git push`.
3. Em **Settings → Pages**, escolha:
   - **Source:** "Deploy from a branch";
   - **Branch:** `main`;
   - **Pasta:** `/ (root)`;
   - depois carregue em **Save**.
4. Após 1 a 2 minutos, o site fica disponível em `https://SEU-UTILIZADOR.github.io/mozrural-me/`.

---

## 4. Activar o login Google (área "Actualizar dados")

É feito uma única vez, na [Google Cloud Console](https://console.cloud.google.com/).

1. **Criar projecto:** no seletor de projectos, escolha **Novo projecto** (ex.: "MozRural M&A").
2. **Activar a API:** em **APIs e serviços → Biblioteca**, pesquise **Google Sheets API** e carregue em **Activar**.
3. **Ecrã de consentimento OAuth:** em **APIs e serviços → Ecrã de consentimento OAuth** (ou "Google Auth Platform"):
   - **Tipo de utilizador:** Externo, ou Interno se tiver Google Workspace e todos os editores forem da organização.
   - **Nome da aplicação e email de suporte:** preencha.
   - **Âmbitos (scopes):** adicione `.../auth/spreadsheets` e `.../auth/userinfo.email`.
   - **Utilizadores de teste:** adicione os emails das pessoas que vão actualizar dados. Em modo "Teste", só estas contas conseguem fazer login, o que é uma camada extra de protecção.
4. **Criar credenciais:** em **APIs e serviços → Credenciais → Criar credenciais → ID de cliente OAuth**:
   - **Tipo:** Aplicação Web.
   - **Origens JavaScript autorizadas:** `https://SEU-UTILIZADOR.github.io`. Use só o domínio, sem a pasta do repositório. Para testes locais, adicione também `http://localhost:8000`.
   - Copie o **ID de cliente**, que termina em `.apps.googleusercontent.com`.
5. **Editar `config.js`** no GitHub (ícone de lápis) e preencher:

```js
SHEET_ID: "1AbCdEf...xyz",
CLIENT_ID: "123456789-abc.apps.googleusercontent.com",
```

Faça commit. Em 1 a 2 minutos o site passa a ler o seu Google Sheet.

> O `CLIENT_ID` não é um segredo e pode estar no código público. Nenhuma palavra-passe ou chave secreta fica no site.

---

## 5. Como funciona a protecção

1. Na área **Actualizar dados**, a pessoa entra com a sua conta Google.
2. A plataforma pede ao Google uma autorização em nome dessa pessoa.
3. Antes de abrir o painel, faz uma **escrita de teste**: um registo na folha `Acessos`.
   - O **Google só aceita a escrita se a conta for Editor do ficheiro**.
   - Se a conta for apenas leitora ou não tiver acesso, o Google recusa e o painel mostra **"Acesso negado"**.
4. Todas as gravações seguintes são feitas com essa mesma autorização. Mesmo que alguém manipule o código no navegador, o Google continua a recusar escritas de quem não é Editor.
5. Para **dar ou retirar acesso**, basta mudar a partilha do Google Sheet. Não é preciso mexer no site.

**Limitações a conhecer:**

- **Os dados são públicos para leitura.** Como o Sheet está partilhado "com o link", qualquer pessoa com o link pode ler todas as folhas. Isto inclui `Historico` e `Acessos`, que contêm os emails dos editores. Se não quiser isso, apague periodicamente o conteúdo dessas folhas ou mova-as para outro ficheiro.
- **Atraso nas actualizações.** Depois de gravar, o dashboard público pode demorar cerca de 1 minuto a mostrar os novos valores, porque o Google guarda a leitura pública em cache. Quem gravou vê-os de imediato.
- **Aviso de app não verificada.** Se o ecrã de consentimento estiver em modo "Produção" sem verificação, o Google mostra esse aviso no login. Em modo "Teste", com os editores como utilizadores de teste, não há problema.

---

## 6. O que se pode fazer na área "Actualizar dados"

| Separador | Função |
|---|---|
| **Dados anuais** | Escolher o indicador, editar meta, realizado e nota por ano, adicionar um novo ano e remover um ano. As células alteradas ficam destacadas antes de gravar. |
| **Indicadores** | Editar nome, descrição, unidade, meta final, regra de cálculo e responsável, ou **criar um novo indicador**. |
| **Projecto** | Editar a ficha do projecto: objectivo, orçamento, área de implementação… |
| **Histórico** | Ver as últimas alterações: quem, quando, e os valores antes e depois. |

Alterações estruturais maiores, como novos componentes ou reordenação, podem ser feitas directamente no Google Sheet.

Sem `SHEET_ID`/`CLIENT_ID` configurados, o painel oferece um **modo demonstração**: as alterações aparecem no ecrã mas não são gravadas.

---

## 7. Testar no computador

O site precisa de ser servido por HTTP, não basta abrir o ficheiro directamente:

```bash
cd mozrural-me
python3 -m http.server 8000
# abrir http://localhost:8000
```

---

## 8. Dados de exemplo: o que verificar

Os valores em `dados-exemplo/` e no modelo `.xlsx` foram transcritos do dashboard Power BI (actualização de 17-10-2026). Antes de usar, confirme:

- **PRI 1 a PRI 4:** só estava visível o alcance geral (sem série anual). Foram registados no ano 2026, com uma nota, até confirmar o ano de referência.
- **IRI 3.2.3 (FNDS):** os valores eram idênticos aos da Biofund (IRI 3.2.2) no Power BI. Provavelmente é um erro de cópia.
- **Valores de 2026 iguais aos de 2025** em vários indicadores. Confirme se são medições novas.
- **IRI 5 e IRI 5.1 em 2025:** o realizado aparecia como 0 e foi registado como "sem medição".
- **IRI 2.4:** não existia no Power BI. A numeração foi mantida.
- **Folha `Locais`:** está vazia. Preencha-a com coordenadas para mostrar mapas nos indicadores de infra-estruturas e beneficiários.
