-- Recorrência declarada também vira lançamento previsto, para o planejamento
-- ter linha na planilha e não só um número no card.
--
-- A tabela é 100% derivada (`rebuildForecasts` apaga e refaz no boot), então
-- recriá-la não perde dado nenhum — é o jeito mais honesto de mudar o formato
-- de algo que ninguém escreveu à mão.
--
-- `kind` existe para o total não contar duas vezes: o comprometido já soma a
-- recorrência por `recorrentesDoMes`, que sabe se ela já caiu no mês e usa o
-- valor REAL quando caiu. Só `installment` entra em `parcelasCents`.
--
-- `installment_seq`/`installment_total` passam a aceitar NULL: recorrência sem
-- prazo não tem "de quantas", e 0 ali seria um total falso.
DROP TABLE IF EXISTS forecast_transactions;

CREATE TABLE forecast_transactions (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    kind              TEXT    NOT NULL DEFAULT 'installment'
                              CHECK(kind IN ('installment','recurring')),
    date              TEXT    NOT NULL,
    ref_month         TEXT    NOT NULL,
    account_id        TEXT    NOT NULL REFERENCES accounts(id),
    amount_cents      INTEGER NOT NULL CHECK(amount_cents >= 0),
    description       TEXT    NOT NULL,
    flow              TEXT    NOT NULL CHECK(flow IN ('expense','income')),
    category_id       INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    installment_seq   INTEGER,
    installment_total INTEGER,
    source_tx_id      INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    UNIQUE(source_tx_id, kind, ref_month)
);
