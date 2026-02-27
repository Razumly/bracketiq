package com.razumly.mvp.eventDetail.data

data class BracketNode(
    val id: String,
    val matchId: Int? = null,
    val winnerNextMatchId: String? = null,
    val loserNextMatchId: String? = null,
    val previousLeftId: String? = null,
    val previousRightId: String? = null,
)

enum class BracketValidationErrorCode {
    UNKNOWN_REFERENCE,
    SELF_REFERENCE,
    DUPLICATE_SOURCE_TARGET,
    TARGET_OVER_CAPACITY,
    CYCLE_DETECTED,
}

data class BracketValidationError(
    val code: BracketValidationErrorCode,
    val message: String,
    val nodeId: String? = null,
    val referenceId: String? = null,
)

data class BracketNormalizedNode(
    val previousLeftId: String?,
    val previousRightId: String?,
    val incomingCount: Int,
)

data class BracketValidationResult(
    val ok: Boolean,
    val errors: List<BracketValidationError>,
    val normalizedById: Map<String, BracketNormalizedNode>,
    val incomingCountById: Map<String, Int>,
)

enum class BracketLane {
    WINNER,
    LOSER,
}

private data class DirectedEdge(
    val sourceId: String,
    val targetId: String,
)

private fun normalizeRef(value: String?): String? {
    return value?.trim()?.takeIf(String::isNotBlank)
}

private fun detectCycle(nodeIds: List<String>, edges: Collection<DirectedEdge>): Boolean {
    val indegree = nodeIds.associateWith { 0 }.toMutableMap()
    val outgoing = nodeIds.associateWith { mutableListOf<String>() }.toMutableMap()

    edges.forEach { edge ->
        outgoing.getOrPut(edge.sourceId) { mutableListOf() }.add(edge.targetId)
        indegree[edge.targetId] = (indegree[edge.targetId] ?: 0) + 1
    }

    val queue = ArrayDeque<String>()
    nodeIds.forEach { id ->
        if ((indegree[id] ?: 0) == 0) {
            queue.addLast(id)
        }
    }

    var visited = 0
    while (queue.isNotEmpty()) {
        val current = queue.removeFirst()
        visited += 1
        outgoing[current].orEmpty().forEach { nextId ->
            val nextDegree = (indegree[nextId] ?: 0) - 1
            indegree[nextId] = nextDegree
            if (nextDegree == 0) {
                queue.addLast(nextId)
            }
        }
    }

    return visited != nodeIds.size
}

fun validateAndNormalizeBracketGraph(nodes: List<BracketNode>): BracketValidationResult {
    val nodeById = nodes.associateBy { node -> node.id }
    val errors = mutableListOf<BracketValidationError>()
    val edgesByKey = linkedMapOf<String, DirectedEdge>()

    fun addEdge(sourceId: String, targetId: String) {
        if (sourceId == targetId) {
            errors += BracketValidationError(
                code = BracketValidationErrorCode.SELF_REFERENCE,
                message = "Match $sourceId cannot reference itself.",
                nodeId = sourceId,
                referenceId = targetId,
            )
            return
        }
        val key = "$sourceId->$targetId"
        if (key !in edgesByKey) {
            edgesByKey[key] = DirectedEdge(sourceId = sourceId, targetId = targetId)
        }
    }

    nodes.forEach { node ->
        val winnerNext = normalizeRef(node.winnerNextMatchId)
        val loserNext = normalizeRef(node.loserNextMatchId)
        val previousLeft = normalizeRef(node.previousLeftId)
        val previousRight = normalizeRef(node.previousRightId)

        val references = listOf(
            "winnerNextMatchId" to winnerNext,
            "loserNextMatchId" to loserNext,
            "previousLeftId" to previousLeft,
            "previousRightId" to previousRight,
        )

        references.forEach { (label, ref) ->
            if (ref != null && ref !in nodeById) {
                errors += BracketValidationError(
                    code = BracketValidationErrorCode.UNKNOWN_REFERENCE,
                    message = "Match ${node.id} references unknown $label: $ref.",
                    nodeId = node.id,
                    referenceId = ref,
                )
            }
        }

        if (winnerNext != null && loserNext != null && winnerNext == loserNext) {
            errors += BracketValidationError(
                code = BracketValidationErrorCode.DUPLICATE_SOURCE_TARGET,
                message = "Match ${node.id} cannot point both winner and loser to $winnerNext.",
                nodeId = node.id,
                referenceId = winnerNext,
            )
        }

        if (winnerNext != null && winnerNext in nodeById) {
            addEdge(node.id, winnerNext)
        }
        if (loserNext != null && loserNext in nodeById) {
            addEdge(node.id, loserNext)
        }
        if (previousLeft != null && previousLeft in nodeById) {
            addEdge(previousLeft, node.id)
        }
        if (previousRight != null && previousRight in nodeById) {
            addEdge(previousRight, node.id)
        }
    }

    val incomingByTarget = nodeById.keys.associateWith { mutableSetOf<String>() }.toMutableMap()
    edgesByKey.values.forEach { edge ->
        incomingByTarget.getOrPut(edge.targetId) { mutableSetOf() }.add(edge.sourceId)
    }

    incomingByTarget.forEach { (targetId, incomingSet) ->
        if (incomingSet.size > 2) {
            errors += BracketValidationError(
                code = BracketValidationErrorCode.TARGET_OVER_CAPACITY,
                message = "Match $targetId cannot have more than two incoming matches.",
                nodeId = targetId,
            )
        }
    }

    if (errors.isEmpty() && detectCycle(nodeById.keys.toList(), edgesByKey.values)) {
        errors += BracketValidationError(
            code = BracketValidationErrorCode.CYCLE_DETECTED,
            message = "Bracket graph contains a cycle.",
        )
    }

    fun sortIncoming(targetId: String, incoming: Set<String>): List<String> {
        return incoming.sortedWith(
            compareBy<String>(
                { sourceId -> nodeById[sourceId]?.matchId ?: Int.MAX_VALUE },
                { sourceId -> sourceId },
            )
        )
    }

    val normalizedById = incomingByTarget.mapValues { (targetId, incoming) ->
        val ordered = sortIncoming(targetId, incoming)
        BracketNormalizedNode(
            previousLeftId = ordered.getOrNull(0),
            previousRightId = ordered.getOrNull(1),
            incomingCount = incoming.size,
        )
    }

    val incomingCountById = incomingByTarget.mapValues { (_, incoming) -> incoming.size }

    return BracketValidationResult(
        ok = errors.isEmpty(),
        errors = errors,
        normalizedById = normalizedById,
        incomingCountById = incomingCountById,
    )
}

fun filterValidNextMatchCandidates(
    sourceId: String,
    nodes: List<BracketNode>,
    lane: BracketLane,
): List<String> {
    val normalizedSourceId = normalizeRef(sourceId) ?: return emptyList()
    val sourceNode = nodes.firstOrNull { node -> node.id == normalizedSourceId } ?: return emptyList()
    val otherLaneTarget = when (lane) {
        BracketLane.WINNER -> normalizeRef(sourceNode.loserNextMatchId)
        BracketLane.LOSER -> normalizeRef(sourceNode.winnerNextMatchId)
    }

    return nodes.map { it.id }.filter { candidateId ->
        if (candidateId == normalizedSourceId) {
            return@filter false
        }
        if (otherLaneTarget != null && otherLaneTarget == candidateId) {
            return@filter false
        }

        val mutated = nodes.map { node ->
            if (node.id != normalizedSourceId) {
                node
            } else {
                when (lane) {
                    BracketLane.WINNER -> node.copy(winnerNextMatchId = candidateId)
                    BracketLane.LOSER -> node.copy(loserNextMatchId = candidateId)
                }
            }
        }

        val result = validateAndNormalizeBracketGraph(mutated)
        (result.incomingCountById[candidateId] ?: 0) <= 2
    }
}
