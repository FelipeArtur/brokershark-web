# BrokerShark

Demonstração local de um painel financeiro com dados inteiramente fictícios.

[Read in English](README.md).

## Executar a vitrine

Requer Node 26 ou superior.

```bash
cd backend
npm ci
npm start
```

Abra `http://127.0.0.1:8000`. Para outra porta, use `npm start -- --port 8080`.

Cada execução cria um ledger sintético novo em pasta temporária. O servidor não
abre ledger externo, não lê configuração pessoal e não consulta pastas pessoais
de backup. Seu banco é somente de leitura; importação e alterações são bloqueadas.
A interface identifica os dados como fictícios.

Contas, comerciantes, lançamentos, faturas e posições de investimento são
inventados. O gerador usa semente aleatória fixa e cobre os 24 meses terminados
hoje. Não usa cópia anonimizada de um ledger real. Capturas antigas não estão
incluídas.

## Verificar

```bash
cd backend
npm test
npm run privacy
npm run demo -- /tmp/novo-ledger-ficticio.db
npm run audit -- /tmp/novo-ledger-ficticio.db
```

Escolha um destino novo para o gerador: arquivos existentes não são sobrescritos.
A verificação de privacidade examina todo o histórico alcançável, incluindo
metadados dos commits, e recusa descrições de perfis de usuários, e-mails privados,
caminhos de usuário e arquivos de dados. Não certifica cópias externas.

## Código

React e fontes são distribuídos localmente. Node serve a interface e um ledger
SQLite sintético. Dinheiro é representado em centavos inteiros; as regras têm
testes e o ledger gerado passa por consultas de auditoria de invariantes.

Leitores de formatos e regras de domínio permanecem no código para estudo.
O servidor da vitrine não registra rotas de importação nem permite escrita.
Instituições citadas nos adaptadores descrevem formatos públicos, não contas
de uma pessoa.

Consulte [LICENSE](LICENSE) para uso permitido e atribuição.
