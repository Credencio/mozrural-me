/*
 * Configuração do Sistema de M&A MozRural.
 * Este é o único ficheiro que precisa de editar para ligar a plataforma ao seu Google Sheet.
 * Veja o README.md para o passo-a-passo.
 */
window.APP_CONFIG = {
  // ID do Google Sheet: a parte entre /d/ e /edit no link do ficheiro.
  // Ex.: https://docs.google.com/spreadsheets/d/1AbC...xyz/edit  ->  "1AbC...xyz"
  // Deixe vazio ("") para usar os dados de exemplo da pasta dados-exemplo/.
  SHEET_ID: "1IvCxKnKa8sFEX3spmIRwnRDzqCExAJaivhWwOrZVVyM",

  // ID de cliente OAuth (Google Cloud Console > APIs e serviços > Credenciais).
  // Necessário apenas para a área "Actualizar dados". É público por natureza; não é um segredo.
  CLIENT_ID: "289067560907-52bf7u46c5pq85g4lsu6pd0o6p0eupa6.apps.googleusercontent.com",

  // Nomes das folhas (só altere se mudar os nomes no Google Sheet).
  SHEETS: {
    projecto: "Projecto",
    componentes: "Componentes",
    indicadores: "Indicadores",
    dados: "Dados",
    locais: "Locais",
    historico: "Historico",
    acessos: "Acessos"
  },

  // Logótipos dos parceiros: o nome tem de coincidir com o escrito em Projecto > implementadores / financiador.
  LOGOS: {
    "FNDS": "assets/img/logos/fnds.png",
    "ProAzul": "assets/img/logos/proazul.png",
    "Biofund": "assets/img/logos/biofund.png",
    "Banco Mundial": "assets/img/logos/worldbank.png",
    "World Bank": "assets/img/logos/worldbank.png",
    "MozRural": "assets/img/logos/mozrural.png"
  },

  // Períodos do quadro de resultados (usados quando a folha Projecto não tem a chave "periodos").
  // Formato: número=rótulo; o texto antes do parêntese é o rótulo curto dos gráficos.
  PERIODOS: "1=Ano 1 (Jun 21 - Jun 22); 2=Ano 2 (Jun 22 - Jun 23); 3=Ano 3 (Jun 23 - Jun 24); 4=Ano 4 (Jun 24 - Jun 25); 5=Ano 5 (Jun 25 - Jun 26); 6=Final (Dez 26)",

  // Desagregações que NÃO contam nos resumos (números do topo). O indicador é subindicador quando o nome
  // termina com uma destas palavras, ex.: "… (mulheres)" ou "… – Jovens". Todos os outros contam como principais.
  SUBINDICADORES: ["mulheres", "jovens", "homens"],

  // Limiares do estado de cada indicador (percentagem da meta).
  LIMIARES: { atingido: 100, emCurso: 70 }
};
