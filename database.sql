-- FinTrack - Sistema Financeiro
-- Execute este arquivo para criar o banco de dados

CREATE DATABASE IF NOT EXISTS fintrack CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE fintrack;

CREATE TABLE IF NOT EXISTS transacoes (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    nome            VARCHAR(150) NOT NULL,
    data            DATE NOT NULL,
    tipo            ENUM('emprestimo', 'recebimento', 'despesa', 'receita') NOT NULL,
    valor           DECIMAL(15,2) NOT NULL,
    taxa_juros      DECIMAL(5,2)  DEFAULT NULL COMMENT 'Taxa de juros em % (ex: 5.00 = 5%)',
    periodicidade   ENUM('diario','semanal','mensal') DEFAULT NULL COMMENT 'Periodicidade da cobrança dos juros',
    valor_com_juros DECIMAL(15,2) DEFAULT NULL COMMENT 'Valor × (1 + taxa_juros / 100)',
    status          ENUM('pendente', 'recebido', 'pago', 'cancelado') NOT NULL DEFAULT 'pendente',
    observacoes     TEXT,
    data_vencimento DATE,
    criado_em       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    atualizado_em   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS lembretes (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    transacao_id  INT,
    mensagem      VARCHAR(255) NOT NULL,
    data_lembrete DATE NOT NULL,
    lido          TINYINT(1) DEFAULT 0,
    criado_em     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (transacao_id) REFERENCES transacoes(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Dados de exemplo
INSERT INTO transacoes (nome, data, tipo, valor, taxa_juros, periodicidade, valor_com_juros, status, observacoes, data_vencimento) VALUES
('João Silva',    CURDATE() - INTERVAL 5  DAY, 'emprestimo', 1500.00, 5.00,  'mensal',  1575.00, 'pendente',  'Empréstimo pessoal',     CURDATE() + INTERVAL 2 DAY),
('Maria Souza',   CURDATE() - INTERVAL 10 DAY, 'emprestimo', 3200.00, 2.50,  'semanal', 3280.00, 'pendente',  'Para reformar casa',     CURDATE() + INTERVAL 1 DAY),
('Carlos Lima',   CURDATE() - INTERVAL 15 DAY, 'emprestimo',  800.00, NULL,  NULL,         NULL, 'recebido',  'Quitado antecipadamente',CURDATE() - INTERVAL 2 DAY),
('Ana Costa',     CURDATE() - INTERVAL 3  DAY, 'emprestimo', 2500.00, 10.00, 'mensal',  2750.00, 'pendente',  'Negócio pessoal',        CURDATE() + INTERVAL 5 DAY),
('Pedro Alves',   CURDATE() - INTERVAL 7  DAY, 'recebimento',1200.00, NULL,  NULL,         NULL, 'recebido',  'Pagamento parcial',      CURDATE() - INTERVAL 1 DAY),
('Fernanda Reis', CURDATE() - INTERVAL 20 DAY, 'emprestimo', 4000.00, 3.00,  'diario',  4120.00, 'pendente',  'Emergência médica',      CURDATE() + INTERVAL 0 DAY),
('Roberto Nunes', CURDATE() - INTERVAL 2  DAY, 'receita',     500.00, NULL,  NULL,         NULL, 'recebido',  'Serviço prestado',       NULL),
('Lucia Mendes',  CURDATE() - INTERVAL 8  DAY, 'despesa',     350.00, NULL,  NULL,         NULL, 'pago',      'Conta de luz',           NULL);