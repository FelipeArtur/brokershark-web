-- Recorrência com PRAZO. Sem isto toda marca valia pra sempre, e um contrato de
-- 12x declarado como recorrente enchia o planejamento com meses que nunca vão
-- existir — pior que não planejar, porque a tela afirma o que não vai acontecer.
--
-- 'YYYY-MM' e NULL = indeterminado (aluguel, assinatura). O mês INICIAL continua
-- saindo do lançamento apontado: copiá-lo aqui criaria uma segunda verdade.
ALTER TABLE recurring_marks ADD COLUMN until_month TEXT;
