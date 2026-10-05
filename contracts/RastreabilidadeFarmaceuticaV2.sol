// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title RastreabilidadeFarmaceuticaV2
 * @notice Rastreabilidade de lotes farmacêuticos com identidade de organizações e operadores,
 *         custódia quantitativa, transferências com aceite, transporte opcional, bloqueio,
 *         recolhimento, dispensação, destruição e histórico de auditoria encadeado por hash.
 *
 * IMPORTANTE SOBRE IDENTIDADE E PRIVACIDADE:
 * - O nome do operador é armazenado on-chain e é imutável neste contrato para preservar o histórico.
 * - Em rede pública, prefira nome de exibição/pseudônimo e um ID corporativo não sensível.
 * - Documentos pessoais, CNPJ/CPF, laudos, comprovantes e demais arquivos devem ficar off-chain;
 *   este contrato guarda apenas os respectivos hashes quando aplicável.
 *
 * IMPORTANTE SOBRE "RASTREABILIDADE 100%":
 * - A blockchain garante a integridade e autoria das declarações registradas no contrato.
 * - Ela não consegue, sozinha, provar que um evento físico ocorreu no mundo real.
 *   Leitores de QR/serial, integrações de ERP/WMS, assinatura de dispositivos e/ou oráculos
 *   podem ser adicionados na dApp para fortalecer essa camada física.
 */
contract RastreabilidadeFarmaceuticaV2 {

    // =====================================================
    // ENUMS
    // =====================================================

    enum Papel {
        Nenhum,
        Fabricante,
        Distribuidor,
        Dispensador,
        Transportador,
        Regulador
    }

    enum StatusLote {
        Inexistente,
        Ativo,
        Bloqueado,
        Recolhido,
        Encerrado
    }

    enum TipoTransferencia {
        Comercial,
        Devolucao,
        Recolhimento
    }

    enum StatusTransferencia {
        Inexistente,
        Criada,
        EmTransito,
        AguardandoRecebimento,
        Confirmada,
        Recusada,
        Cancelada
    }

    enum TipoEvento {
        RegistroLote,
        TransferenciaCriada,
        ExpedicaoConfirmada,
        ColetaTransportadora,
        AtualizacaoTransporte,
        EntregaTransportadora,
        RecebimentoConfirmado,
        RecebimentoRecusado,
        TransferenciaCancelada,
        BloqueioLote,
        DesbloqueioLote,
        RecolhimentoLote,
        Dispensacao,
        Destruicao,
        Ocorrencia
    }

    // =====================================================
    // ESTRUTURAS DE IDENTIDADE
    // =====================================================

    struct Organizacao {
        bool existe;
        bytes32 id;
        string idExterno;
        string nome;
        bytes32 documentoHash;
        Papel papel;
        bool ativa;
        uint256 cadastradaEm;
    }

    struct Operador {
        bool existe;
        bytes32 id;
        string idExterno;
        string nome;
        string cargo;
        address carteira;
        bytes32 organizacaoId;
        bool ativo;
        bool administrador;
        uint256 cadastradoEm;
    }

    struct DadosOrganizacao {
        string idExterno;
        string nome;
        bytes32 documentoHash;
        Papel papel;
    }

    struct DadosOperador {
        string idExterno;
        string nome;
        string cargo;
        address carteira;
        string organizacaoIdExterno;
        bool administrador;
    }

    // =====================================================
    // ESTRUTURAS DO LOTE
    // =====================================================

    struct Lote {
        bool existe;
        bytes32 id;
        string identificador;
        string codigoProduto;
        string descricaoProduto;
        uint256 dataFabricacao;
        uint256 dataValidade;
        uint256 quantidadeInicial;
        uint256 quantidadeEmCirculacao;
        uint256 quantidadeDispensada;
        uint256 quantidadeDestruida;
        bytes32 hashLaudo;
        bytes32 hashMetadados;
        bytes32 fabricanteOrganizacaoId;
        StatusLote status;
        uint256 criadoEm;
        bytes32 ultimoHashAuditoria;
    }

    struct DadosRegistroLote {
        string identificador;
        string codigoProduto;
        string descricaoProduto;
        uint256 dataFabricacao;
        uint256 dataValidade;
        uint256 quantidadeInicial;
        bytes32 hashLaudo;
        bytes32 hashMetadados;
        string localizacaoInicial;
        string observacao;
    }

    // =====================================================
    // ESTRUTURAS DE TRANSFERÊNCIA
    // =====================================================

    struct Transferencia {
        bool existe;
        bytes32 id;
        bytes32 loteId;
        TipoTransferencia tipo;
        StatusTransferencia status;
        uint256 quantidade;
        bytes32 organizacaoOrigemId;
        bytes32 organizacaoDestinoId;
        bytes32 organizacaoTransportadoraId;
        bytes32 criadaPorOperadorId;
        bytes32 expedidaPorOperadorId;
        bytes32 entreguePorOperadorId;
        bytes32 finalizadaPorOperadorId;
        uint256 criadaEm;
        uint256 expedidaEm;
        uint256 entregueEm;
        uint256 finalizadaEm;
        bytes32 hashDocumentoSaida;
        bytes32 hashDocumentoFinal;
        string localOrigem;
        string localDestino;
        string observacao;
    }

    struct DadosNovaTransferencia {
        string identificadorLote;
        string organizacaoDestinoIdExterno;
        string organizacaoTransportadoraIdExterno; // vazio = sem transportadora cadastrada
        TipoTransferencia tipo;
        uint256 quantidade;
        string localOrigem;
        bytes32 hashDocumentoSaida;
        string observacao;
    }

    // =====================================================
    // AUDITORIA
    // =====================================================

    struct RegistroAuditoria {
        uint256 sequenciaGlobal;
        uint256 indiceNoLote;
        TipoEvento tipoEvento;
        uint256 dataHora;
        bytes32 operadorId;
        address carteiraOperador;
        bytes32 organizacaoOperadorId;
        bytes32 organizacaoOrigemId;
        bytes32 organizacaoDestinoId;
        bytes32 transferenciaId;
        uint256 quantidade;
        string localizacao;
        bytes32 hashDocumento;
        string observacao;
        bytes32 hashAnterior;
        bytes32 hashRegistro;
    }

    struct DadosAuditoria {
        TipoEvento tipoEvento;
        bytes32 organizacaoOrigemId;
        bytes32 organizacaoDestinoId;
        bytes32 transferenciaId;
        uint256 quantidade;
        string localizacao;
        bytes32 hashDocumento;
        string observacao;
    }

    // =====================================================
    // ARMAZENAMENTO
    // =====================================================

    mapping(bytes32 => Organizacao) private organizacoes;
    mapping(bytes32 => Operador) private operadores;
    mapping(address => bytes32) private operadorIdPorCarteira;

    mapping(bytes32 => Lote) private lotes;

    // loteId => organizacaoId => quantidade sob custódia
    mapping(bytes32 => mapping(bytes32 => uint256)) private saldos;

    // loteId => organizacaoId => quantidade reservada em transferências ainda não finalizadas
    mapping(bytes32 => mapping(bytes32 => uint256)) private saldosReservados;

    mapping(bytes32 => Transferencia) private transferencias;
    mapping(bytes32 => bytes32[]) private transferenciasPorLote;
    mapping(bytes32 => RegistroAuditoria[]) private historicos;

    // Índices auxiliares para a dApp.
    mapping(bytes32 => bytes32[]) private operadoresPorOrganizacao;
    mapping(bytes32 => bytes32[]) private organizacoesComCustodiaPorLote;
    mapping(bytes32 => mapping(bytes32 => bool)) private organizacaoJaIndexadaNoLote;

    bytes32[] private listaOrganizacoes;
    bytes32[] private listaOperadores;
    bytes32[] private listaLotes;
    bytes32[] private listaTransferencias;

    uint256 public totalRegistrosAuditoria;
    uint256 public totalTransferencias;

    bytes32 public immutable organizacaoReguladoraInicialId;
    bytes32 public immutable operadorReguladorInicialId;

    bool public sistemaPausado;

    uint256 private constant LIMITE_PAGINACAO = 100;

    // =====================================================
    // EVENTOS ADMINISTRATIVOS
    // =====================================================

    event OrganizacaoCadastrada(
        bytes32 indexed organizacaoId,
        string idExterno,
        string nome,
        Papel papel,
        bytes32 indexed executadoPorOperadorId
    );

    event StatusOrganizacaoAlterado(
        bytes32 indexed organizacaoId,
        bool ativa,
        string motivo,
        bytes32 indexed executadoPorOperadorId
    );

    event OperadorCadastrado(
        bytes32 indexed operadorId,
        string idExterno,
        string nome,
        address indexed carteira,
        bytes32 indexed organizacaoId,
        bool administrador,
        bytes32 executadoPorOperadorId
    );

    event StatusOperadorAlterado(
        bytes32 indexed operadorId,
        bool ativo,
        string motivo,
        bytes32 indexed executadoPorOperadorId
    );

    event CarteiraOperadorAlterada(
        bytes32 indexed operadorId,
        address indexed carteiraAnterior,
        address indexed carteiraNova,
        string motivo,
        bytes32 executadoPorOperadorId
    );

    event SistemaPausadoAlterado(
        bool pausado,
        string motivo,
        bytes32 indexed executadoPorOperadorId
    );

    // =====================================================
    // EVENTOS OPERACIONAIS
    // =====================================================

    event LoteRegistrado(
        bytes32 indexed loteId,
        string identificador,
        bytes32 indexed fabricanteOrganizacaoId,
        bytes32 indexed operadorId,
        uint256 quantidadeInicial
    );

    event StatusLoteAlterado(
        bytes32 indexed loteId,
        StatusLote statusAnterior,
        StatusLote statusNovo,
        bytes32 indexed operadorId,
        string motivo
    );

    event TransferenciaCriada(
        bytes32 indexed transferenciaId,
        bytes32 indexed loteId,
        bytes32 indexed organizacaoOrigemId,
        bytes32 organizacaoDestinoId,
        bytes32 organizacaoTransportadoraId,
        uint256 quantidade,
        TipoTransferencia tipo
    );

    event StatusTransferenciaAlterado(
        bytes32 indexed transferenciaId,
        StatusTransferencia statusAnterior,
        StatusTransferencia statusNovo,
        bytes32 indexed operadorId
    );

    event SaldoLoteMovimentado(
        bytes32 indexed loteId,
        bytes32 indexed organizacaoId,
        uint256 saldo,
        uint256 reservado
    );

    event RegistroAuditoriaCriado(
        bytes32 indexed loteId,
        uint256 indexed indiceNoLote,
        uint256 indexed sequenciaGlobal,
        TipoEvento tipoEvento,
        bytes32 operadorId,
        address carteiraOperador,
        bytes32 organizacaoOperadorId,
        bytes32 transferenciaId,
        bytes32 hashRegistro
    );

    // =====================================================
    // CONSTRUTOR
    // =====================================================

    /**
     * @param idOrganizacaoReguladora ID corporativo estável, ex.: "REG-001"
     * @param nomeOrganizacaoReguladora Nome de exibição da autoridade/regulador
     * @param documentoHashRegulador Hash do documento de identificação da organização
     * @param idOperadorInicial ID estável do primeiro operador, ex.: "OP-REG-001"
     * @param nomeOperadorInicial Nome de exibição do primeiro operador
     */
    constructor(
        string memory idOrganizacaoReguladora,
        string memory nomeOrganizacaoReguladora,
        bytes32 documentoHashRegulador,
        string memory idOperadorInicial,
        string memory nomeOperadorInicial
    ) {
        require(bytes(idOrganizacaoReguladora).length > 0, "ID da organizacao reguladora obrigatorio");
        require(bytes(nomeOrganizacaoReguladora).length > 0, "Nome da organizacao reguladora obrigatorio");
        require(bytes(idOperadorInicial).length > 0, "ID do operador inicial obrigatorio");
        require(bytes(nomeOperadorInicial).length > 0, "Nome do operador inicial obrigatorio");

        bytes32 orgId = _id(idOrganizacaoReguladora);
        bytes32 opId = _id(idOperadorInicial);

        organizacaoReguladoraInicialId = orgId;
        operadorReguladorInicialId = opId;

        organizacoes[orgId] = Organizacao({
            existe: true,
            id: orgId,
            idExterno: idOrganizacaoReguladora,
            nome: nomeOrganizacaoReguladora,
            documentoHash: documentoHashRegulador,
            papel: Papel.Regulador,
            ativa: true,
            cadastradaEm: block.timestamp
        });
        listaOrganizacoes.push(orgId);

        operadores[opId] = Operador({
            existe: true,
            id: opId,
            idExterno: idOperadorInicial,
            nome: nomeOperadorInicial,
            cargo: "Administrador Regulador",
            carteira: msg.sender,
            organizacaoId: orgId,
            ativo: true,
            administrador: true,
            cadastradoEm: block.timestamp
        });
        operadorIdPorCarteira[msg.sender] = opId;
        listaOperadores.push(opId);
        operadoresPorOrganizacao[orgId].push(opId);

        emit OrganizacaoCadastrada(
            orgId,
            idOrganizacaoReguladora,
            nomeOrganizacaoReguladora,
            Papel.Regulador,
            opId
        );

        emit OperadorCadastrado(
            opId,
            idOperadorInicial,
            nomeOperadorInicial,
            msg.sender,
            orgId,
            true,
            opId
        );
    }

    // =====================================================
    // MODIFICADORES
    // =====================================================

    modifier quandoSistemaAtivo() {
        require(!sistemaPausado, "Sistema pausado pelo regulador");
        _;
    }

    // =====================================================
    // IDENTIFICADORES E HASHES
    // =====================================================

    function calcularId(string calldata valor) external pure returns (bytes32) {
        require(bytes(valor).length > 0, "Valor vazio");
        return keccak256(bytes(valor));
    }

    function gerarHash(string calldata documento) external pure returns (bytes32) {
        return keccak256(bytes(documento));
    }

    function _id(string memory valor) internal pure returns (bytes32) {
        return keccak256(bytes(valor));
    }

    function _idOpcional(string memory valor) internal pure returns (bytes32) {
        if (bytes(valor).length == 0) {
            return bytes32(0);
        }
        return keccak256(bytes(valor));
    }

    // =====================================================
    // CONTROLE DE ACESSO INTERNO
    // =====================================================

    function _operadorAtual() internal view returns (Operador storage operador) {
        bytes32 operadorId = operadorIdPorCarteira[msg.sender];
        require(operadorId != bytes32(0), "Carteira sem operador cadastrado");

        operador = operadores[operadorId];
        require(operador.existe && operador.ativo, "Operador inativo ou inexistente");

        Organizacao storage org = organizacoes[operador.organizacaoId];
        require(org.existe && org.ativa, "Organizacao inativa ou inexistente");
    }

    function _operadorReguladorAtual() internal view returns (Operador storage operador) {
        operador = _operadorAtual();
        require(
            organizacoes[operador.organizacaoId].papel == Papel.Regulador,
            "Somente regulador"
        );
    }

    function _podeAdministrarOrganizacao(
        Operador storage executor,
        bytes32 organizacaoAlvoId
    ) internal view returns (bool) {
        Papel papelExecutor = organizacoes[executor.organizacaoId].papel;

        if (papelExecutor == Papel.Regulador) {
            return true;
        }

        return executor.administrador && executor.organizacaoId == organizacaoAlvoId;
    }

    // =====================================================
    // ORGANIZAÇÕES
    // =====================================================

    function cadastrarOrganizacao(
        DadosOrganizacao calldata dados
    ) external {
        Operador storage executor = _operadorReguladorAtual();

        require(bytes(dados.idExterno).length > 0, "ID externo obrigatorio");
        require(bytes(dados.nome).length > 0, "Nome obrigatorio");
        require(dados.papel != Papel.Nenhum, "Papel invalido");

        bytes32 orgId = _id(dados.idExterno);
        require(!organizacoes[orgId].existe, "Organizacao ja cadastrada");

        organizacoes[orgId] = Organizacao({
            existe: true,
            id: orgId,
            idExterno: dados.idExterno,
            nome: dados.nome,
            documentoHash: dados.documentoHash,
            papel: dados.papel,
            ativa: true,
            cadastradaEm: block.timestamp
        });

        listaOrganizacoes.push(orgId);

        emit OrganizacaoCadastrada(
            orgId,
            dados.idExterno,
            dados.nome,
            dados.papel,
            executor.id
        );
    }

    function alterarStatusOrganizacao(
        string calldata organizacaoIdExterno,
        bool ativa,
        string calldata motivo
    ) external {
        Operador storage executor = _operadorReguladorAtual();
        require(bytes(motivo).length > 0, "Motivo obrigatorio");

        bytes32 orgId = _id(organizacaoIdExterno);
        Organizacao storage org = organizacoes[orgId];
        require(org.existe, "Organizacao inexistente");
        require(org.ativa != ativa, "Organizacao ja possui este status");

        // Protege a autoridade inicial contra desativação acidental e perda total de governança.
        if (!ativa) {
            require(
                orgId != organizacaoReguladoraInicialId,
                "Organizacao reguladora inicial nao pode ser desativada"
            );
        }

        org.ativa = ativa;

        emit StatusOrganizacaoAlterado(
            orgId,
            ativa,
            motivo,
            executor.id
        );
    }

    // =====================================================
    // OPERADORES
    // =====================================================

    function cadastrarOperador(
        DadosOperador calldata dados
    ) external {
        Operador storage executor = _operadorAtual();

        require(bytes(dados.idExterno).length > 0, "ID externo do operador obrigatorio");
        require(bytes(dados.nome).length > 0, "Nome do operador obrigatorio");
        require(dados.carteira != address(0), "Carteira invalida");
        require(bytes(dados.organizacaoIdExterno).length > 0, "Organizacao obrigatoria");

        bytes32 orgId = _id(dados.organizacaoIdExterno);
        Organizacao storage org = organizacoes[orgId];
        require(org.existe && org.ativa, "Organizacao inexistente ou inativa");
        require(
            _podeAdministrarOrganizacao(executor, orgId),
            "Sem permissao para cadastrar operador nesta organizacao"
        );

        bytes32 opId = _id(dados.idExterno);
        require(!operadores[opId].existe, "ID de operador ja utilizado");

        bytes32 vinculoAtual = operadorIdPorCarteira[dados.carteira];
        if (vinculoAtual != bytes32(0)) {
            require(!operadores[vinculoAtual].ativo, "Carteira ja vinculada a operador ativo");
        }

        operadores[opId] = Operador({
            existe: true,
            id: opId,
            idExterno: dados.idExterno,
            nome: dados.nome,
            cargo: dados.cargo,
            carteira: dados.carteira,
            organizacaoId: orgId,
            ativo: true,
            administrador: dados.administrador,
            cadastradoEm: block.timestamp
        });

        operadorIdPorCarteira[dados.carteira] = opId;
        listaOperadores.push(opId);
        operadoresPorOrganizacao[orgId].push(opId);

        emit OperadorCadastrado(
            opId,
            dados.idExterno,
            dados.nome,
            dados.carteira,
            orgId,
            dados.administrador,
            executor.id
        );
    }

    function alterarStatusOperador(
        string calldata operadorIdExterno,
        bool ativo,
        string calldata motivo
    ) external {
        Operador storage executor = _operadorAtual();
        require(bytes(motivo).length > 0, "Motivo obrigatorio");

        bytes32 opId = _id(operadorIdExterno);
        Operador storage alvo = operadores[opId];
        require(alvo.existe, "Operador inexistente");
        require(alvo.ativo != ativo, "Operador ja possui este status");
        require(
            _podeAdministrarOrganizacao(executor, alvo.organizacaoId),
            "Sem permissao para administrar este operador"
        );

        if (ativo) {
            Organizacao storage org = organizacoes[alvo.organizacaoId];
            require(org.ativa, "Organizacao do operador esta inativa");

            bytes32 vinculoAtual = operadorIdPorCarteira[alvo.carteira];
            if (vinculoAtual != bytes32(0) && vinculoAtual != opId) {
                require(!operadores[vinculoAtual].ativo, "Carteira vinculada a outro operador ativo");
            }
            operadorIdPorCarteira[alvo.carteira] = opId;
        }

        // Evita o bloqueio acidental do operador regulador inicial.
        if (!ativo) {
            require(opId != operadorReguladorInicialId, "Operador regulador inicial nao pode ser desativado");
        }

        alvo.ativo = ativo;

        emit StatusOperadorAlterado(
            opId,
            ativo,
            motivo,
            executor.id
        );
    }

    function alterarCarteiraOperador(
        string calldata operadorIdExterno,
        address novaCarteira,
        string calldata motivo
    ) external {
        Operador storage executor = _operadorAtual();
        require(novaCarteira != address(0), "Nova carteira invalida");
        require(bytes(motivo).length > 0, "Motivo obrigatorio");

        bytes32 opId = _id(operadorIdExterno);
        Operador storage alvo = operadores[opId];
        require(alvo.existe, "Operador inexistente");
        require(
            _podeAdministrarOrganizacao(executor, alvo.organizacaoId),
            "Sem permissao para administrar este operador"
        );
        require(alvo.carteira != novaCarteira, "Nova carteira igual a atual");

        bytes32 vinculoNova = operadorIdPorCarteira[novaCarteira];
        if (vinculoNova != bytes32(0) && vinculoNova != opId) {
            require(!operadores[vinculoNova].ativo, "Nova carteira vinculada a operador ativo");
        }

        address carteiraAnterior = alvo.carteira;

        if (operadorIdPorCarteira[carteiraAnterior] == opId) {
            operadorIdPorCarteira[carteiraAnterior] = bytes32(0);
        }

        alvo.carteira = novaCarteira;
        operadorIdPorCarteira[novaCarteira] = opId;

        emit CarteiraOperadorAlterada(
            opId,
            carteiraAnterior,
            novaCarteira,
            motivo,
            executor.id
        );
    }

    // =====================================================
    // PAUSA DE EMERGÊNCIA
    // =====================================================

    function alterarPausaSistema(
        bool pausado,
        string calldata motivo
    ) external {
        Operador storage executor = _operadorReguladorAtual();
        require(bytes(motivo).length > 0, "Motivo obrigatorio");
        require(sistemaPausado != pausado, "Sistema ja possui este estado");

        sistemaPausado = pausado;

        emit SistemaPausadoAlterado(
            pausado,
            motivo,
            executor.id
        );
    }

    // =====================================================
    // REGISTRO DO LOTE
    // =====================================================

    function registrarLote(
        DadosRegistroLote calldata dados
    ) external quandoSistemaAtivo {
        Operador storage operador = _operadorAtual();
        Organizacao storage org = organizacoes[operador.organizacaoId];

        require(org.papel == Papel.Fabricante, "Somente fabricante registra lote");
        require(bytes(dados.identificador).length > 0, "Identificador do lote obrigatorio");
        require(bytes(dados.codigoProduto).length > 0, "Codigo do produto obrigatorio");
        require(dados.quantidadeInicial > 0, "Quantidade inicial deve ser maior que zero");
        require(dados.dataFabricacao <= block.timestamp, "Data de fabricacao futura");
        require(dados.dataValidade > dados.dataFabricacao, "Data de validade invalida");
        require(dados.dataValidade > block.timestamp, "Lote ja vencido");
        require(dados.hashLaudo != bytes32(0), "Hash do laudo obrigatorio");
        require(bytes(dados.localizacaoInicial).length > 0, "Localizacao inicial obrigatoria");

        bytes32 loteId = _id(dados.identificador);
        require(!lotes[loteId].existe, "Lote ja registrado");

        lotes[loteId] = Lote({
            existe: true,
            id: loteId,
            identificador: dados.identificador,
            codigoProduto: dados.codigoProduto,
            descricaoProduto: dados.descricaoProduto,
            dataFabricacao: dados.dataFabricacao,
            dataValidade: dados.dataValidade,
            quantidadeInicial: dados.quantidadeInicial,
            quantidadeEmCirculacao: dados.quantidadeInicial,
            quantidadeDispensada: 0,
            quantidadeDestruida: 0,
            hashLaudo: dados.hashLaudo,
            hashMetadados: dados.hashMetadados,
            fabricanteOrganizacaoId: operador.organizacaoId,
            status: StatusLote.Ativo,
            criadoEm: block.timestamp,
            ultimoHashAuditoria: bytes32(0)
        });

        saldos[loteId][operador.organizacaoId] = dados.quantidadeInicial;
        listaLotes.push(loteId);
        organizacoesComCustodiaPorLote[loteId].push(operador.organizacaoId);
        organizacaoJaIndexadaNoLote[loteId][operador.organizacaoId] = true;

        _registrarAuditoria(
            loteId,
            operador,
            DadosAuditoria({
                tipoEvento: TipoEvento.RegistroLote,
                organizacaoOrigemId: bytes32(0),
                organizacaoDestinoId: operador.organizacaoId,
                transferenciaId: bytes32(0),
                quantidade: dados.quantidadeInicial,
                localizacao: dados.localizacaoInicial,
                hashDocumento: dados.hashLaudo,
                observacao: dados.observacao
            })
        );

        emit LoteRegistrado(
            loteId,
            dados.identificador,
            operador.organizacaoId,
            operador.id,
            dados.quantidadeInicial
        );

        emit SaldoLoteMovimentado(
            loteId,
            operador.organizacaoId,
            saldos[loteId][operador.organizacaoId],
            saldosReservados[loteId][operador.organizacaoId]
        );
    }

    // =====================================================
    // TRANSFERÊNCIAS
    // =====================================================

    function criarTransferencia(
        DadosNovaTransferencia calldata dados
    ) external quandoSistemaAtivo returns (bytes32 transferenciaId) {
        Operador storage operador = _operadorAtual();

        bytes32 loteId = _id(dados.identificadorLote);
        Lote storage lote = lotes[loteId];
        require(lote.existe, "Lote inexistente");
        require(dados.quantidade > 0, "Quantidade deve ser maior que zero");
        require(bytes(dados.organizacaoDestinoIdExterno).length > 0, "Destino obrigatorio");
        require(bytes(dados.localOrigem).length > 0, "Local de origem obrigatorio");

        bytes32 orgOrigemId = operador.organizacaoId;
        bytes32 orgDestinoId = _id(dados.organizacaoDestinoIdExterno);
        bytes32 orgTransportadorId = _idOpcional(dados.organizacaoTransportadoraIdExterno);

        Organizacao storage orgOrigem = organizacoes[orgOrigemId];
        Organizacao storage orgDestino = organizacoes[orgDestinoId];

        require(orgDestino.existe && orgDestino.ativa, "Organizacao de destino inexistente ou inativa");
        require(orgOrigemId != orgDestinoId, "Origem e destino devem ser diferentes");
        require(
            saldoDisponivelPorIds(loteId, orgOrigemId) >= dados.quantidade,
            "Saldo disponivel insuficiente"
        );

        if (orgTransportadorId != bytes32(0)) {
            Organizacao storage transportador = organizacoes[orgTransportadorId];
            require(transportador.existe && transportador.ativa, "Transportador inexistente ou inativo");
            require(transportador.papel == Papel.Transportador, "Organizacao indicada nao e transportadora");
        }

        _validarFluxoTransferencia(
            lote,
            orgOrigem.papel,
            orgDestino.papel,
            dados.tipo
        );

        totalTransferencias += 1;
        transferenciaId = keccak256(
            abi.encode(
                address(this),
                block.chainid,
                loteId,
                totalTransferencias,
                orgOrigemId,
                orgDestinoId,
                dados.quantidade
            )
        );

        transferencias[transferenciaId] = Transferencia({
            existe: true,
            id: transferenciaId,
            loteId: loteId,
            tipo: dados.tipo,
            status: StatusTransferencia.Criada,
            quantidade: dados.quantidade,
            organizacaoOrigemId: orgOrigemId,
            organizacaoDestinoId: orgDestinoId,
            organizacaoTransportadoraId: orgTransportadorId,
            criadaPorOperadorId: operador.id,
            expedidaPorOperadorId: bytes32(0),
            entreguePorOperadorId: bytes32(0),
            finalizadaPorOperadorId: bytes32(0),
            criadaEm: block.timestamp,
            expedidaEm: 0,
            entregueEm: 0,
            finalizadaEm: 0,
            hashDocumentoSaida: dados.hashDocumentoSaida,
            hashDocumentoFinal: bytes32(0),
            localOrigem: dados.localOrigem,
            localDestino: "",
            observacao: dados.observacao
        });

        saldosReservados[loteId][orgOrigemId] += dados.quantidade;
        transferenciasPorLote[loteId].push(transferenciaId);
        listaTransferencias.push(transferenciaId);

        _registrarAuditoria(
            loteId,
            operador,
            DadosAuditoria({
                tipoEvento: TipoEvento.TransferenciaCriada,
                organizacaoOrigemId: orgOrigemId,
                organizacaoDestinoId: orgDestinoId,
                transferenciaId: transferenciaId,
                quantidade: dados.quantidade,
                localizacao: dados.localOrigem,
                hashDocumento: dados.hashDocumentoSaida,
                observacao: dados.observacao
            })
        );

        emit TransferenciaCriada(
            transferenciaId,
            loteId,
            orgOrigemId,
            orgDestinoId,
            orgTransportadorId,
            dados.quantidade,
            dados.tipo
        );

        emit SaldoLoteMovimentado(
            loteId,
            orgOrigemId,
            saldos[loteId][orgOrigemId],
            saldosReservados[loteId][orgOrigemId]
        );
    }

    /**
     * @notice Usado quando não existe uma organização transportadora cadastrada na transferência.
     *         O operador da organização de origem declara a expedição física.
     */
    function confirmarExpedicao(
        bytes32 transferenciaId,
        string calldata localizacao,
        bytes32 hashDocumento,
        string calldata observacao
    ) external quandoSistemaAtivo {
        Operador storage operador = _operadorAtual();
        Transferencia storage transferencia = _obterTransferencia(transferenciaId);

        require(transferencia.status == StatusTransferencia.Criada, "Transferencia nao esta pronta para expedicao");
        require(transferencia.organizacaoTransportadoraId == bytes32(0), "Transferencia possui transportador cadastrado");
        require(operador.organizacaoId == transferencia.organizacaoOrigemId, "Somente a origem pode confirmar expedicao");
        require(bytes(localizacao).length > 0, "Localizacao obrigatoria");

        _validarSaidaAindaPermitida(transferencia);

        StatusTransferencia anterior = transferencia.status;
        transferencia.status = StatusTransferencia.EmTransito;
        transferencia.expedidaPorOperadorId = operador.id;
        transferencia.expedidaEm = block.timestamp;

        _registrarAuditoria(
            transferencia.loteId,
            operador,
            DadosAuditoria({
                tipoEvento: TipoEvento.ExpedicaoConfirmada,
                organizacaoOrigemId: transferencia.organizacaoOrigemId,
                organizacaoDestinoId: transferencia.organizacaoDestinoId,
                transferenciaId: transferenciaId,
                quantidade: transferencia.quantidade,
                localizacao: localizacao,
                hashDocumento: hashDocumento,
                observacao: observacao
            })
        );

        emit StatusTransferenciaAlterado(
            transferenciaId,
            anterior,
            transferencia.status,
            operador.id
        );
    }

    /**
     * @notice Usado quando há transportadora cadastrada. Um operador da transportadora
     *         confirma a coleta física e passa a transferência para "EmTransito".
     */
    function confirmarColetaTransportador(
        bytes32 transferenciaId,
        string calldata localizacao,
        bytes32 hashDocumento,
        string calldata observacao
    ) external quandoSistemaAtivo {
        Operador storage operador = _operadorAtual();
        Transferencia storage transferencia = _obterTransferencia(transferenciaId);

        require(transferencia.status == StatusTransferencia.Criada, "Transferencia nao esta pronta para coleta");
        require(transferencia.organizacaoTransportadoraId != bytes32(0), "Transferencia sem transportador cadastrado");
        require(operador.organizacaoId == transferencia.organizacaoTransportadoraId, "Somente a transportadora designada");
        require(bytes(localizacao).length > 0, "Localizacao obrigatoria");

        _validarSaidaAindaPermitida(transferencia);

        StatusTransferencia anterior = transferencia.status;
        transferencia.status = StatusTransferencia.EmTransito;
        transferencia.expedidaPorOperadorId = operador.id;
        transferencia.expedidaEm = block.timestamp;

        _registrarAuditoria(
            transferencia.loteId,
            operador,
            DadosAuditoria({
                tipoEvento: TipoEvento.ColetaTransportadora,
                organizacaoOrigemId: transferencia.organizacaoOrigemId,
                organizacaoDestinoId: transferencia.organizacaoDestinoId,
                transferenciaId: transferenciaId,
                quantidade: transferencia.quantidade,
                localizacao: localizacao,
                hashDocumento: hashDocumento,
                observacao: observacao
            })
        );

        emit StatusTransferenciaAlterado(
            transferenciaId,
            anterior,
            transferencia.status,
            operador.id
        );
    }

    /**
     * @notice Permite registrar checkpoints de transporte sem alterar a custódia.
     *         Ex.: hub logístico, inspeção, desvio de rota, temperatura fora da faixa.
     */
    function registrarAtualizacaoTransporte(
        bytes32 transferenciaId,
        string calldata localizacao,
        bytes32 hashDocumento,
        string calldata observacao
    ) external quandoSistemaAtivo {
        Operador storage operador = _operadorAtual();
        Transferencia storage transferencia = _obterTransferencia(transferenciaId);

        require(transferencia.status == StatusTransferencia.EmTransito, "Transferencia nao esta em transito");
        require(transferencia.organizacaoTransportadoraId != bytes32(0), "Transferencia sem transportador cadastrado");
        require(operador.organizacaoId == transferencia.organizacaoTransportadoraId, "Somente a transportadora designada");
        require(
            bytes(localizacao).length > 0 || bytes(observacao).length > 0 || hashDocumento != bytes32(0),
            "Atualizacao vazia"
        );

        _registrarAuditoria(
            transferencia.loteId,
            operador,
            DadosAuditoria({
                tipoEvento: TipoEvento.AtualizacaoTransporte,
                organizacaoOrigemId: transferencia.organizacaoOrigemId,
                organizacaoDestinoId: transferencia.organizacaoDestinoId,
                transferenciaId: transferenciaId,
                quantidade: transferencia.quantidade,
                localizacao: localizacao,
                hashDocumento: hashDocumento,
                observacao: observacao
            })
        );
    }

    function confirmarEntregaTransportador(
        bytes32 transferenciaId,
        string calldata localizacao,
        bytes32 hashDocumento,
        string calldata observacao
    ) external quandoSistemaAtivo {
        Operador storage operador = _operadorAtual();
        Transferencia storage transferencia = _obterTransferencia(transferenciaId);

        require(transferencia.status == StatusTransferencia.EmTransito, "Transferencia nao esta em transito");
        require(transferencia.organizacaoTransportadoraId != bytes32(0), "Transferencia sem transportador cadastrado");
        require(operador.organizacaoId == transferencia.organizacaoTransportadoraId, "Somente a transportadora designada");
        require(bytes(localizacao).length > 0, "Localizacao obrigatoria");

        StatusTransferencia anterior = transferencia.status;
        transferencia.status = StatusTransferencia.AguardandoRecebimento;
        transferencia.entreguePorOperadorId = operador.id;
        transferencia.entregueEm = block.timestamp;
        transferencia.localDestino = localizacao;

        _registrarAuditoria(
            transferencia.loteId,
            operador,
            DadosAuditoria({
                tipoEvento: TipoEvento.EntregaTransportadora,
                organizacaoOrigemId: transferencia.organizacaoOrigemId,
                organizacaoDestinoId: transferencia.organizacaoDestinoId,
                transferenciaId: transferenciaId,
                quantidade: transferencia.quantidade,
                localizacao: localizacao,
                hashDocumento: hashDocumento,
                observacao: observacao
            })
        );

        emit StatusTransferenciaAlterado(
            transferenciaId,
            anterior,
            transferencia.status,
            operador.id
        );
    }

    /**
     * @notice A custódia quantitativa só muda aqui, após confirmação do destinatário.
     *         Se houver transportadora, o destinatário pode confirmar a partir de EmTransito
     *         ou AguardandoRecebimento; a ausência do marco de entrega continuará visível no histórico.
     */
    function confirmarRecebimento(
        bytes32 transferenciaId,
        string calldata localizacao,
        bytes32 hashDocumentoRecebimento,
        string calldata observacao
    ) external quandoSistemaAtivo {
        Operador storage operador = _operadorAtual();
        Transferencia storage transferencia = _obterTransferencia(transferenciaId);

        require(
            transferencia.status == StatusTransferencia.EmTransito ||
            transferencia.status == StatusTransferencia.AguardandoRecebimento,
            "Transferencia nao pode ser recebida neste estado"
        );
        require(operador.organizacaoId == transferencia.organizacaoDestinoId, "Somente o destino pode confirmar recebimento");
        require(bytes(localizacao).length > 0, "Localizacao de recebimento obrigatoria");

        uint256 reservado = saldosReservados[transferencia.loteId][transferencia.organizacaoOrigemId];
        require(reservado >= transferencia.quantidade, "Reserva inconsistente");
        require(
            saldos[transferencia.loteId][transferencia.organizacaoOrigemId] >= transferencia.quantidade,
            "Saldo da origem inconsistente"
        );

        saldosReservados[transferencia.loteId][transferencia.organizacaoOrigemId] -= transferencia.quantidade;
        saldos[transferencia.loteId][transferencia.organizacaoOrigemId] -= transferencia.quantidade;
        saldos[transferencia.loteId][transferencia.organizacaoDestinoId] += transferencia.quantidade;

        if (!organizacaoJaIndexadaNoLote[transferencia.loteId][transferencia.organizacaoDestinoId]) {
            organizacaoJaIndexadaNoLote[transferencia.loteId][transferencia.organizacaoDestinoId] = true;
            organizacoesComCustodiaPorLote[transferencia.loteId].push(transferencia.organizacaoDestinoId);
        }

        StatusTransferencia anterior = transferencia.status;
        transferencia.status = StatusTransferencia.Confirmada;
        transferencia.finalizadaPorOperadorId = operador.id;
        transferencia.finalizadaEm = block.timestamp;
        transferencia.hashDocumentoFinal = hashDocumentoRecebimento;
        transferencia.localDestino = localizacao;

        _registrarAuditoria(
            transferencia.loteId,
            operador,
            DadosAuditoria({
                tipoEvento: TipoEvento.RecebimentoConfirmado,
                organizacaoOrigemId: transferencia.organizacaoOrigemId,
                organizacaoDestinoId: transferencia.organizacaoDestinoId,
                transferenciaId: transferenciaId,
                quantidade: transferencia.quantidade,
                localizacao: localizacao,
                hashDocumento: hashDocumentoRecebimento,
                observacao: observacao
            })
        );

        emit StatusTransferenciaAlterado(
            transferenciaId,
            anterior,
            transferencia.status,
            operador.id
        );

        emit SaldoLoteMovimentado(
            transferencia.loteId,
            transferencia.organizacaoOrigemId,
            saldos[transferencia.loteId][transferencia.organizacaoOrigemId],
            saldosReservados[transferencia.loteId][transferencia.organizacaoOrigemId]
        );

        emit SaldoLoteMovimentado(
            transferencia.loteId,
            transferencia.organizacaoDestinoId,
            saldos[transferencia.loteId][transferencia.organizacaoDestinoId],
            saldosReservados[transferencia.loteId][transferencia.organizacaoDestinoId]
        );
    }

    function recusarRecebimento(
        bytes32 transferenciaId,
        string calldata localizacao,
        bytes32 hashDocumento,
        string calldata motivo
    ) external quandoSistemaAtivo {
        Operador storage operador = _operadorAtual();
        Transferencia storage transferencia = _obterTransferencia(transferenciaId);

        require(
            transferencia.status == StatusTransferencia.EmTransito ||
            transferencia.status == StatusTransferencia.AguardandoRecebimento,
            "Transferencia nao pode ser recusada neste estado"
        );
        require(operador.organizacaoId == transferencia.organizacaoDestinoId, "Somente o destino pode recusar recebimento");
        require(bytes(localizacao).length > 0, "Localizacao obrigatoria");
        require(bytes(motivo).length > 0, "Motivo da recusa obrigatorio");

        uint256 reservado = saldosReservados[transferencia.loteId][transferencia.organizacaoOrigemId];
        require(reservado >= transferencia.quantidade, "Reserva inconsistente");
        saldosReservados[transferencia.loteId][transferencia.organizacaoOrigemId] -= transferencia.quantidade;

        StatusTransferencia anterior = transferencia.status;
        transferencia.status = StatusTransferencia.Recusada;
        transferencia.finalizadaPorOperadorId = operador.id;
        transferencia.finalizadaEm = block.timestamp;
        transferencia.hashDocumentoFinal = hashDocumento;
        transferencia.localDestino = localizacao;

        _registrarAuditoria(
            transferencia.loteId,
            operador,
            DadosAuditoria({
                tipoEvento: TipoEvento.RecebimentoRecusado,
                organizacaoOrigemId: transferencia.organizacaoOrigemId,
                organizacaoDestinoId: transferencia.organizacaoDestinoId,
                transferenciaId: transferenciaId,
                quantidade: transferencia.quantidade,
                localizacao: localizacao,
                hashDocumento: hashDocumento,
                observacao: motivo
            })
        );

        emit StatusTransferenciaAlterado(
            transferenciaId,
            anterior,
            transferencia.status,
            operador.id
        );

        emit SaldoLoteMovimentado(
            transferencia.loteId,
            transferencia.organizacaoOrigemId,
            saldos[transferencia.loteId][transferencia.organizacaoOrigemId],
            saldosReservados[transferencia.loteId][transferencia.organizacaoOrigemId]
        );
    }

    /**
     * @notice Só é possível cancelar antes da expedição/coleta.
     *         Após o início do trânsito, o destino deve confirmar ou recusar o recebimento.
     */
    function cancelarTransferencia(
        bytes32 transferenciaId,
        string calldata motivo
    ) external {
        Operador storage operador = _operadorAtual();
        Transferencia storage transferencia = _obterTransferencia(transferenciaId);

        require(transferencia.status == StatusTransferencia.Criada, "So e possivel cancelar antes da expedicao");
        require(bytes(motivo).length > 0, "Motivo obrigatorio");

        bool ehOrigem = operador.organizacaoId == transferencia.organizacaoOrigemId;
        bool ehRegulador = organizacoes[operador.organizacaoId].papel == Papel.Regulador;
        require(ehOrigem || ehRegulador, "Sem permissao para cancelar transferencia");

        uint256 reservado = saldosReservados[transferencia.loteId][transferencia.organizacaoOrigemId];
        require(reservado >= transferencia.quantidade, "Reserva inconsistente");
        saldosReservados[transferencia.loteId][transferencia.organizacaoOrigemId] -= transferencia.quantidade;

        StatusTransferencia anterior = transferencia.status;
        transferencia.status = StatusTransferencia.Cancelada;
        transferencia.finalizadaPorOperadorId = operador.id;
        transferencia.finalizadaEm = block.timestamp;

        _registrarAuditoria(
            transferencia.loteId,
            operador,
            DadosAuditoria({
                tipoEvento: TipoEvento.TransferenciaCancelada,
                organizacaoOrigemId: transferencia.organizacaoOrigemId,
                organizacaoDestinoId: transferencia.organizacaoDestinoId,
                transferenciaId: transferenciaId,
                quantidade: transferencia.quantidade,
                localizacao: transferencia.localOrigem,
                hashDocumento: bytes32(0),
                observacao: motivo
            })
        );

        emit StatusTransferenciaAlterado(
            transferenciaId,
            anterior,
            transferencia.status,
            operador.id
        );

        emit SaldoLoteMovimentado(
            transferencia.loteId,
            transferencia.organizacaoOrigemId,
            saldos[transferencia.loteId][transferencia.organizacaoOrigemId],
            saldosReservados[transferencia.loteId][transferencia.organizacaoOrigemId]
        );
    }

    // =====================================================
    // BLOQUEIO, DESBLOQUEIO E RECOLHIMENTO
    // =====================================================

    function bloquearLote(
        string calldata identificador,
        string calldata localizacao,
        bytes32 hashDocumento,
        string calldata motivo
    ) external {
        Operador storage operador = _operadorReguladorAtual();
        bytes32 loteId = _id(identificador);
        Lote storage lote = lotes[loteId];

        require(lote.existe, "Lote inexistente");
        require(lote.status == StatusLote.Ativo, "Somente lote ativo pode ser bloqueado");
        require(bytes(motivo).length > 0, "Motivo obrigatorio");

        StatusLote anterior = lote.status;
        lote.status = StatusLote.Bloqueado;

        _registrarAuditoria(
            loteId,
            operador,
            DadosAuditoria({
                tipoEvento: TipoEvento.BloqueioLote,
                organizacaoOrigemId: bytes32(0),
                organizacaoDestinoId: bytes32(0),
                transferenciaId: bytes32(0),
                quantidade: lote.quantidadeEmCirculacao,
                localizacao: localizacao,
                hashDocumento: hashDocumento,
                observacao: motivo
            })
        );

        emit StatusLoteAlterado(
            loteId,
            anterior,
            lote.status,
            operador.id,
            motivo
        );
    }

    function desbloquearLote(
        string calldata identificador,
        string calldata localizacao,
        bytes32 hashDocumento,
        string calldata motivo
    ) external {
        Operador storage operador = _operadorReguladorAtual();
        bytes32 loteId = _id(identificador);
        Lote storage lote = lotes[loteId];

        require(lote.existe, "Lote inexistente");
        require(lote.status == StatusLote.Bloqueado, "Lote nao esta bloqueado");
        require(bytes(motivo).length > 0, "Motivo obrigatorio");

        StatusLote anterior = lote.status;
        lote.status = StatusLote.Ativo;

        _registrarAuditoria(
            loteId,
            operador,
            DadosAuditoria({
                tipoEvento: TipoEvento.DesbloqueioLote,
                organizacaoOrigemId: bytes32(0),
                organizacaoDestinoId: bytes32(0),
                transferenciaId: bytes32(0),
                quantidade: lote.quantidadeEmCirculacao,
                localizacao: localizacao,
                hashDocumento: hashDocumento,
                observacao: motivo
            })
        );

        emit StatusLoteAlterado(
            loteId,
            anterior,
            lote.status,
            operador.id,
            motivo
        );
    }

    function recolherLote(
        string calldata identificador,
        string calldata localizacao,
        bytes32 hashDocumento,
        string calldata motivo
    ) external {
        Operador storage operador = _operadorReguladorAtual();
        bytes32 loteId = _id(identificador);
        Lote storage lote = lotes[loteId];

        require(lote.existe, "Lote inexistente");
        require(
            lote.status == StatusLote.Ativo || lote.status == StatusLote.Bloqueado,
            "Lote nao pode ser recolhido neste estado"
        );
        require(bytes(motivo).length > 0, "Motivo obrigatorio");

        StatusLote anterior = lote.status;
        lote.status = StatusLote.Recolhido;

        _registrarAuditoria(
            loteId,
            operador,
            DadosAuditoria({
                tipoEvento: TipoEvento.RecolhimentoLote,
                organizacaoOrigemId: bytes32(0),
                organizacaoDestinoId: bytes32(0),
                transferenciaId: bytes32(0),
                quantidade: lote.quantidadeEmCirculacao,
                localizacao: localizacao,
                hashDocumento: hashDocumento,
                observacao: motivo
            })
        );

        emit StatusLoteAlterado(
            loteId,
            anterior,
            lote.status,
            operador.id,
            motivo
        );
    }

    // =====================================================
    // DISPENSAÇÃO E DESTRUIÇÃO
    // =====================================================

    function dispensar(
        string calldata identificador,
        uint256 quantidade,
        string calldata localizacao,
        bytes32 hashComprovante,
        string calldata observacao
    ) external quandoSistemaAtivo {
        Operador storage operador = _operadorAtual();
        require(organizacoes[operador.organizacaoId].papel == Papel.Dispensador, "Somente dispensador");

        bytes32 loteId = _id(identificador);
        Lote storage lote = lotes[loteId];

        require(lote.existe, "Lote inexistente");
        require(lote.status == StatusLote.Ativo, "Lote nao esta liberado");
        require(block.timestamp <= lote.dataValidade, "Lote vencido");
        require(quantidade > 0, "Quantidade deve ser maior que zero");
        require(bytes(localizacao).length > 0, "Localizacao obrigatoria");
        require(
            saldoDisponivelPorIds(loteId, operador.organizacaoId) >= quantidade,
            "Saldo disponivel insuficiente"
        );

        saldos[loteId][operador.organizacaoId] -= quantidade;
        lote.quantidadeDispensada += quantidade;
        lote.quantidadeEmCirculacao -= quantidade;

        _registrarAuditoria(
            loteId,
            operador,
            DadosAuditoria({
                tipoEvento: TipoEvento.Dispensacao,
                organizacaoOrigemId: operador.organizacaoId,
                organizacaoDestinoId: bytes32(0),
                transferenciaId: bytes32(0),
                quantidade: quantidade,
                localizacao: localizacao,
                hashDocumento: hashComprovante,
                observacao: observacao
            })
        );

        _encerrarLoteSeSemCirculacao(loteId, operador.id);

        emit SaldoLoteMovimentado(
            loteId,
            operador.organizacaoId,
            saldos[loteId][operador.organizacaoId],
            saldosReservados[loteId][operador.organizacaoId]
        );
    }

    function registrarDestruicao(
        string calldata identificador,
        uint256 quantidade,
        string calldata localizacao,
        bytes32 hashComprovante,
        string calldata observacao
    ) external quandoSistemaAtivo {
        Operador storage operador = _operadorAtual();
        bytes32 loteId = _id(identificador);
        Lote storage lote = lotes[loteId];

        require(lote.existe, "Lote inexistente");
        require(quantidade > 0, "Quantidade deve ser maior que zero");
        require(bytes(localizacao).length > 0, "Localizacao obrigatoria");
        require(hashComprovante != bytes32(0), "Hash do comprovante de destruicao obrigatorio");
        require(
            lote.status == StatusLote.Recolhido ||
            lote.status == StatusLote.Bloqueado ||
            block.timestamp > lote.dataValidade,
            "Destruicao permitida apenas para lote recolhido, bloqueado ou vencido"
        );
        require(
            saldoDisponivelPorIds(loteId, operador.organizacaoId) >= quantidade,
            "Saldo disponivel insuficiente"
        );

        saldos[loteId][operador.organizacaoId] -= quantidade;
        lote.quantidadeDestruida += quantidade;
        lote.quantidadeEmCirculacao -= quantidade;

        _registrarAuditoria(
            loteId,
            operador,
            DadosAuditoria({
                tipoEvento: TipoEvento.Destruicao,
                organizacaoOrigemId: operador.organizacaoId,
                organizacaoDestinoId: bytes32(0),
                transferenciaId: bytes32(0),
                quantidade: quantidade,
                localizacao: localizacao,
                hashDocumento: hashComprovante,
                observacao: observacao
            })
        );

        _encerrarLoteSeSemCirculacao(loteId, operador.id);

        emit SaldoLoteMovimentado(
            loteId,
            operador.organizacaoId,
            saldos[loteId][operador.organizacaoId],
            saldosReservados[loteId][operador.organizacaoId]
        );
    }

    // =====================================================
    // OCORRÊNCIAS GERAIS
    // =====================================================

    /**
     * @notice Registra uma ocorrência sem alterar saldo/status.
     *         Exemplos: inspeção, desvio de temperatura, avaria, conferência, auditoria local.
     *         Reguladores podem registrar em qualquer lote; demais organizações precisam ter saldo do lote.
     */
    function registrarOcorrencia(
        string calldata identificador,
        string calldata localizacao,
        bytes32 hashDocumento,
        string calldata observacao
    ) external quandoSistemaAtivo {
        Operador storage operador = _operadorAtual();
        bytes32 loteId = _id(identificador);
        Lote storage lote = lotes[loteId];

        require(lote.existe, "Lote inexistente");
        require(
            bytes(localizacao).length > 0 || bytes(observacao).length > 0 || hashDocumento != bytes32(0),
            "Ocorrencia vazia"
        );

        bool ehRegulador = organizacoes[operador.organizacaoId].papel == Papel.Regulador;
        bool possuiSaldo = saldos[loteId][operador.organizacaoId] > 0;
        require(ehRegulador || possuiSaldo, "Organizacao nao possui custodia deste lote");

        _registrarAuditoria(
            loteId,
            operador,
            DadosAuditoria({
                tipoEvento: TipoEvento.Ocorrencia,
                organizacaoOrigemId: operador.organizacaoId,
                organizacaoDestinoId: bytes32(0),
                transferenciaId: bytes32(0),
                quantidade: 0,
                localizacao: localizacao,
                hashDocumento: hashDocumento,
                observacao: observacao
            })
        );
    }

    // =====================================================
    // VALIDAÇÕES DE FLUXO
    // =====================================================

    function _validarFluxoTransferencia(
        Lote storage lote,
        Papel papelOrigem,
        Papel papelDestino,
        TipoTransferencia tipo
    ) internal view {
        require(
            papelOrigem == Papel.Fabricante ||
            papelOrigem == Papel.Distribuidor ||
            papelOrigem == Papel.Dispensador,
            "Papel de origem nao pode custodiar lote"
        );

        if (tipo == TipoTransferencia.Comercial) {
            require(lote.status == StatusLote.Ativo, "Transferencia comercial exige lote ativo");
            require(block.timestamp <= lote.dataValidade, "Lote vencido nao pode ser comercializado");

            bool fluxoComercialValido =
                (papelOrigem == Papel.Fabricante && papelDestino == Papel.Distribuidor) ||
                (papelOrigem == Papel.Distribuidor &&
                    (papelDestino == Papel.Distribuidor || papelDestino == Papel.Dispensador));

            require(fluxoComercialValido, "Fluxo comercial nao permitido");
            return;
        }

        if (tipo == TipoTransferencia.Devolucao) {
            require(lote.status != StatusLote.Encerrado, "Lote encerrado");

            bool fluxoDevolucaoValido =
                (papelOrigem == Papel.Dispensador &&
                    (papelDestino == Papel.Distribuidor || papelDestino == Papel.Fabricante)) ||
                (papelOrigem == Papel.Distribuidor &&
                    (papelDestino == Papel.Distribuidor || papelDestino == Papel.Fabricante));

            require(fluxoDevolucaoValido, "Fluxo de devolucao nao permitido");
            return;
        }

        // Recolhimento físico de unidades já bloqueadas/recolhidas.
        require(
            lote.status == StatusLote.Bloqueado || lote.status == StatusLote.Recolhido,
            "Transferencia de recolhimento exige lote bloqueado ou recolhido"
        );
        require(
            papelDestino == Papel.Fabricante || papelDestino == Papel.Distribuidor,
            "Destino do recolhimento deve ser fabricante ou distribuidor"
        );
    }

    function _validarSaidaAindaPermitida(
        Transferencia storage transferencia
    ) internal view {
        Lote storage lote = lotes[transferencia.loteId];

        if (transferencia.tipo == TipoTransferencia.Comercial) {
            require(lote.status == StatusLote.Ativo, "Lote deixou de estar ativo antes da saida");
            require(block.timestamp <= lote.dataValidade, "Lote venceu antes da saida");
        } else if (transferencia.tipo == TipoTransferencia.Recolhimento) {
            require(
                lote.status == StatusLote.Bloqueado || lote.status == StatusLote.Recolhido,
                "Lote nao esta mais em condicao de recolhimento"
            );
        } else {
            require(lote.status != StatusLote.Encerrado, "Lote encerrado");
        }
    }

    // =====================================================
    // AUDITORIA INTERNA
    // =====================================================

    function _registrarAuditoria(
        bytes32 loteId,
        Operador storage operador,
        DadosAuditoria memory dados
    ) internal {
        Lote storage lote = lotes[loteId];
        require(lote.existe, "Lote inexistente para auditoria");

        totalRegistrosAuditoria += 1;
        uint256 indiceNoLote = historicos[loteId].length;
        bytes32 hashAnterior = lote.ultimoHashAuditoria;

        RegistroAuditoria memory registro = RegistroAuditoria({
            sequenciaGlobal: totalRegistrosAuditoria,
            indiceNoLote: indiceNoLote,
            tipoEvento: dados.tipoEvento,
            dataHora: block.timestamp,
            operadorId: operador.id,
            carteiraOperador: msg.sender,
            organizacaoOperadorId: operador.organizacaoId,
            organizacaoOrigemId: dados.organizacaoOrigemId,
            organizacaoDestinoId: dados.organizacaoDestinoId,
            transferenciaId: dados.transferenciaId,
            quantidade: dados.quantidade,
            localizacao: dados.localizacao,
            hashDocumento: dados.hashDocumento,
            observacao: dados.observacao,
            hashAnterior: hashAnterior,
            hashRegistro: bytes32(0)
        });

        registro.hashRegistro = _calcularHashRegistro(loteId, registro);
        bytes32 hashRegistro = registro.hashRegistro;

        historicos[loteId].push(registro);

        lote.ultimoHashAuditoria = hashRegistro;

        emit RegistroAuditoriaCriado(
            loteId,
            indiceNoLote,
            totalRegistrosAuditoria,
            dados.tipoEvento,
            operador.id,
            msg.sender,
            operador.organizacaoId,
            dados.transferenciaId,
            hashRegistro
        );
    }

    function _calcularHashRegistro(
        bytes32 loteId,
        RegistroAuditoria memory registro
    ) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                loteId,
                registro.sequenciaGlobal,
                registro.indiceNoLote,
                registro.tipoEvento,
                registro.dataHora,
                registro.operadorId,
                registro.carteiraOperador,
                registro.organizacaoOperadorId,
                registro.organizacaoOrigemId,
                registro.organizacaoDestinoId,
                registro.transferenciaId,
                registro.quantidade,
                keccak256(bytes(registro.localizacao)),
                registro.hashDocumento,
                keccak256(bytes(registro.observacao)),
                registro.hashAnterior
            )
        );
    }

    function _encerrarLoteSeSemCirculacao(
        bytes32 loteId,
        bytes32 operadorId
    ) internal {
        Lote storage lote = lotes[loteId];
        if (lote.quantidadeEmCirculacao == 0 && lote.status != StatusLote.Encerrado) {
            StatusLote anterior = lote.status;
            lote.status = StatusLote.Encerrado;

            emit StatusLoteAlterado(
                loteId,
                anterior,
                StatusLote.Encerrado,
                operadorId,
                "Quantidade em circulacao zerada"
            );
        }
    }

    function _obterTransferencia(
        bytes32 transferenciaId
    ) internal view returns (Transferencia storage transferencia) {
        transferencia = transferencias[transferenciaId];
        require(transferencia.existe, "Transferencia inexistente");
    }

    // =====================================================
    // CONSULTAS DE IDENTIDADE
    // =====================================================

    function consultarOrganizacao(
        string calldata idExterno
    ) external view returns (Organizacao memory) {
        bytes32 orgId = _id(idExterno);
        require(organizacoes[orgId].existe, "Organizacao inexistente");
        return organizacoes[orgId];
    }

    function consultarOrganizacaoPorId(
        bytes32 organizacaoId
    ) external view returns (Organizacao memory) {
        require(organizacoes[organizacaoId].existe, "Organizacao inexistente");
        return organizacoes[organizacaoId];
    }

    function consultarOperador(
        string calldata idExterno
    ) external view returns (Operador memory) {
        bytes32 opId = _id(idExterno);
        require(operadores[opId].existe, "Operador inexistente");
        return operadores[opId];
    }

    function consultarOperadorPorId(
        bytes32 operadorId
    ) external view returns (Operador memory) {
        require(operadores[operadorId].existe, "Operador inexistente");
        return operadores[operadorId];
    }

    function consultarOperadorPorCarteira(
        address carteira
    ) external view returns (Operador memory) {
        bytes32 opId = operadorIdPorCarteira[carteira];
        require(opId != bytes32(0) && operadores[opId].existe, "Carteira sem operador");
        return operadores[opId];
    }

    // =====================================================
    // CONSULTAS DE LOTE E SALDO
    // =====================================================

    function consultarLote(
        string calldata identificador
    ) external view returns (Lote memory) {
        bytes32 loteId = _id(identificador);
        require(lotes[loteId].existe, "Lote inexistente");
        return lotes[loteId];
    }

    function consultarLotePorId(
        bytes32 loteId
    ) external view returns (Lote memory) {
        require(lotes[loteId].existe, "Lote inexistente");
        return lotes[loteId];
    }

    function consultarSaldoLote(
        string calldata identificador,
        string calldata organizacaoIdExterno
    ) external view returns (
        uint256 saldoTotal,
        uint256 saldoReservado,
        uint256 saldoDisponivel
    ) {
        bytes32 loteId = _id(identificador);
        bytes32 orgId = _id(organizacaoIdExterno);
        require(lotes[loteId].existe, "Lote inexistente");
        require(organizacoes[orgId].existe, "Organizacao inexistente");

        saldoTotal = saldos[loteId][orgId];
        saldoReservado = saldosReservados[loteId][orgId];
        saldoDisponivel = saldoTotal - saldoReservado;
    }

    function saldoDisponivelPorIds(
        bytes32 loteId,
        bytes32 organizacaoId
    ) public view returns (uint256) {
        uint256 total = saldos[loteId][organizacaoId];
        uint256 reservado = saldosReservados[loteId][organizacaoId];
        require(total >= reservado, "Inconsistencia de saldo reservado");
        return total - reservado;
    }

    function verificarLote(
        string calldata identificador
    ) external view returns (
        bool registrado,
        bool dentroDaValidade,
        StatusLote status,
        uint256 quantidadeEmCirculacao,
        bytes32 ultimoHashAuditoria
    ) {
        bytes32 loteId = _id(identificador);
        Lote storage lote = lotes[loteId];

        if (!lote.existe) {
            return (false, false, StatusLote.Inexistente, 0, bytes32(0));
        }

        return (
            true,
            block.timestamp <= lote.dataValidade,
            lote.status,
            lote.quantidadeEmCirculacao,
            lote.ultimoHashAuditoria
        );
    }

    // =====================================================
    // CONSULTAS DE TRANSFERÊNCIA
    // =====================================================

    function consultarTransferencia(
        bytes32 transferenciaId
    ) external view returns (Transferencia memory) {
        require(transferencias[transferenciaId].existe, "Transferencia inexistente");
        return transferencias[transferenciaId];
    }

    function quantidadeTransferenciasLote(
        string calldata identificador
    ) external view returns (uint256) {
        bytes32 loteId = _id(identificador);
        require(lotes[loteId].existe, "Lote inexistente");
        return transferenciasPorLote[loteId].length;
    }

    function listarTransferenciasLote(
        string calldata identificador,
        uint256 offset,
        uint256 limite
    ) external view returns (bytes32[] memory pagina) {
        bytes32 loteId = _id(identificador);
        require(lotes[loteId].existe, "Lote inexistente");
        require(limite > 0 && limite <= LIMITE_PAGINACAO, "Limite invalido");

        bytes32[] storage origem = transferenciasPorLote[loteId];
        if (offset >= origem.length) {
            return new bytes32[](0);
        }

        uint256 fim = offset + limite;
        if (fim > origem.length) {
            fim = origem.length;
        }

        pagina = new bytes32[](fim - offset);
        for (uint256 i = offset; i < fim; i++) {
            pagina[i - offset] = origem[i];
        }
    }

    // =====================================================
    // CONSULTAS DE HISTÓRICO / AUDITORIA
    // =====================================================

    function quantidadeRegistrosHistorico(
        string calldata identificador
    ) external view returns (uint256) {
        bytes32 loteId = _id(identificador);
        require(lotes[loteId].existe, "Lote inexistente");
        return historicos[loteId].length;
    }

    function consultarRegistroHistorico(
        string calldata identificador,
        uint256 indice
    ) external view returns (RegistroAuditoria memory) {
        bytes32 loteId = _id(identificador);
        require(lotes[loteId].existe, "Lote inexistente");
        require(indice < historicos[loteId].length, "Indice fora do historico");
        return historicos[loteId][indice];
    }

    function consultarHistorico(
        string calldata identificador,
        uint256 offset,
        uint256 limite
    ) external view returns (RegistroAuditoria[] memory pagina) {
        bytes32 loteId = _id(identificador);
        require(lotes[loteId].existe, "Lote inexistente");
        require(limite > 0 && limite <= LIMITE_PAGINACAO, "Limite invalido");

        RegistroAuditoria[] storage origem = historicos[loteId];
        if (offset >= origem.length) {
            return new RegistroAuditoria[](0);
        }

        uint256 fim = offset + limite;
        if (fim > origem.length) {
            fim = origem.length;
        }

        pagina = new RegistroAuditoria[](fim - offset);
        for (uint256 i = offset; i < fim; i++) {
            pagina[i - offset] = origem[i];
        }
    }

    function verificarIntegridadeRegistro(
        string calldata identificador,
        uint256 indice
    ) external view returns (bool) {
        bytes32 loteId = _id(identificador);
        require(lotes[loteId].existe, "Lote inexistente");
        require(indice < historicos[loteId].length, "Indice fora do historico");

        RegistroAuditoria memory registro = historicos[loteId][indice];
        bytes32 recalculado = _calcularHashRegistro(loteId, registro);

        return recalculado == registro.hashRegistro;
    }

    // =====================================================
    // ENUMERAÇÃO PAGINADA PARA A DAPP
    // =====================================================

    function totalOrganizacoes() external view returns (uint256) {
        return listaOrganizacoes.length;
    }

    function totalOperadores() external view returns (uint256) {
        return listaOperadores.length;
    }

    function totalLotes() external view returns (uint256) {
        return listaLotes.length;
    }

    function listarOrganizacoes(
        uint256 offset,
        uint256 limite
    ) external view returns (bytes32[] memory) {
        return _paginarIds(listaOrganizacoes, offset, limite);
    }

    function listarOperadores(
        uint256 offset,
        uint256 limite
    ) external view returns (bytes32[] memory) {
        return _paginarIds(listaOperadores, offset, limite);
    }

    function listarLotes(
        uint256 offset,
        uint256 limite
    ) external view returns (bytes32[] memory) {
        return _paginarIds(listaLotes, offset, limite);
    }

    function listarTransferencias(
        uint256 offset,
        uint256 limite
    ) external view returns (bytes32[] memory) {
        return _paginarIds(listaTransferencias, offset, limite);
    }

    function listarOperadoresOrganizacao(
        string calldata organizacaoIdExterno,
        uint256 offset,
        uint256 limite
    ) external view returns (bytes32[] memory) {
        bytes32 orgId = _id(organizacaoIdExterno);
        require(organizacoes[orgId].existe, "Organizacao inexistente");
        return _paginarIds(operadoresPorOrganizacao[orgId], offset, limite);
    }

    function listarOrganizacoesComCustodiaLote(
        string calldata identificador,
        uint256 offset,
        uint256 limite
    ) external view returns (bytes32[] memory) {
        bytes32 loteId = _id(identificador);
        require(lotes[loteId].existe, "Lote inexistente");
        return _paginarIds(organizacoesComCustodiaPorLote[loteId], offset, limite);
    }

    function _paginarIds(
        bytes32[] storage origem,
        uint256 offset,
        uint256 limite
    ) internal view returns (bytes32[] memory pagina) {
        require(limite > 0 && limite <= LIMITE_PAGINACAO, "Limite invalido");

        if (offset >= origem.length) {
            return new bytes32[](0);
        }

        uint256 fim = offset + limite;
        if (fim > origem.length) {
            fim = origem.length;
        }

        pagina = new bytes32[](fim - offset);
        for (uint256 i = offset; i < fim; i++) {
            pagina[i - offset] = origem[i];
        }
    }
}
