// Dynamic TSL graph construction is intentionally isolated from TypeScript.
import {
  Fn,
  If,
  Loop,
  attributeArray,
  float,
  instanceIndex,
  uint,
  uniform,
  vec3,
  vec4,
} from 'three/tsl';
import { LIVING_FLOWER } from '../simulation/living-flower-contract';

export function createFlowerTrajectoryGpu(surface) {
  const rayStorage = attributeArray(
    new Float32Array(LIVING_FLOWER.maximumBrushSamples * 8),
    'vec4',
  );
  const hitStorage = attributeArray(
    new Float32Array(LIVING_FLOWER.maximumBrushSamples * 8),
    'vec4',
  );
  const sampleCountNode = uniform(0, 'uint');

  const pickNode = Fn(() => {
    const sampleIndex = instanceIndex;
    If(sampleIndex.lessThan(sampleCountNode), () => {
      const rayOffset = sampleIndex.mul(uint(2));
      const rayOrigin = rayStorage.element(rayOffset).xyz;
      const rayDirection = rayStorage
        .element(rayOffset.add(1))
        .xyz
        .normalize();
      const closestDistance = float(1000000).toVar();
      const selectedPetal = uint(LIVING_FLOWER.maximumPetals).toVar();
      const selectedCell = uint(0).toVar();
      const selectedTriangle = uint(0).toVar();
      const selectedPoint = vec3(0, 0, 0).toVar();
      Loop(
        {
          name: 'petal',
          start: uint(0),
          end: surface.activePetalCountNode,
          type: 'uint',
          condition: '<',
        },
        ({ petal }) => {
          const petalSequence = float(petal).div(
            float(surface.activePetalCountNode.sub(1).max(1)),
          );
          const petalIsInteractionReady = petalSequence
            .greaterThanEqual(
              surface.interactionMinimumOutnessNode.mul(
                surface.interactionMinimumOutnessNode,
              ),
            )
            .and(
              surface.interactionReadinessNode.greaterThan(0),
            );
          If(petalIsInteractionReady, () => {
            const petalOffset = petal.mul(
              surface.gridVertexCountNode,
            );
            Loop(
              {
                name: 'cell',
                start: uint(0),
                end: surface.gridCellCountNode,
                type: 'uint',
                condition: '<',
              },
              ({ cell }) => {
                const column = cell.mod(
                  surface.gridColumnsNode.sub(1),
                );
                const row = cell.div(
                  surface.gridColumnsNode.sub(1),
                );
                const lowerLeft = petalOffset
                  .add(row.mul(surface.gridColumnsNode))
                  .add(column);
                const lowerRight = lowerLeft.add(1);
                const upperLeft = lowerLeft.add(
                  surface.gridColumnsNode,
                );
                const upperRight = upperLeft.add(1);
                const testTriangle = (
                  aIndex,
                  bIndex,
                  cIndex,
                  triangle,
                ) => {
                  const a = surface.positionStorage.element(aIndex).xyz;
                  const edge0 = surface.positionStorage
                    .element(bIndex)
                    .xyz
                    .sub(a);
                  const edge1 = surface.positionStorage
                    .element(cIndex)
                    .xyz
                    .sub(a);
                  const perpendicular = rayDirection.cross(edge1);
                  const determinant = edge0.dot(perpendicular);
                  If(determinant.abs().greaterThan(0.000001), () => {
                    const inverseDeterminant = determinant.reciprocal();
                    const fromA = rayOrigin.sub(a);
                    const baryV = fromA
                      .dot(perpendicular)
                      .mul(inverseDeterminant);
                    const cross = fromA.cross(edge0);
                    const baryW = rayDirection
                      .dot(cross)
                      .mul(inverseDeterminant);
                    const distance = edge1
                      .dot(cross)
                      .mul(inverseDeterminant);
                    const inside = baryV
                      .greaterThanEqual(0)
                      .and(baryW.greaterThanEqual(0))
                      .and(baryV.add(baryW).lessThanEqual(1))
                      .and(distance.greaterThan(0.0001));
                    If(
                      inside.and(
                        distance.lessThan(
                          closestDistance.sub(0.0005),
                        ),
                      ),
                      () => {
                        closestDistance.assign(distance);
                        selectedPetal.assign(petal);
                        selectedCell.assign(cell);
                        selectedTriangle.assign(triangle);
                        selectedPoint.assign(
                          rayOrigin.add(
                            rayDirection.mul(distance),
                          ),
                        );
                      },
                    );
                  });
                };
                testTriangle(
                  lowerLeft,
                  lowerRight,
                  upperRight,
                  uint(0),
                );
                testTriangle(
                  lowerLeft,
                  upperRight,
                  upperLeft,
                  uint(1),
                );
              },
            );
          });
        },
      );
      const found = selectedPetal.lessThan(
        surface.activePetalCountNode,
      );
      hitStorage.element(sampleIndex).assign(
        found.select(
          vec4(
            selectedPoint,
            float(selectedPetal.add(1)).add(
              float(selectedCell.mul(2).add(selectedTriangle)).div(1024),
            ),
          ),
          vec4(0),
        ),
      );
      hitStorage
        .element(
          sampleIndex.add(uint(LIVING_FLOWER.maximumBrushSamples)),
        )
        .assign(
          found.select(
            vec4(
              selectedPetal,
              selectedCell,
              selectedTriangle,
              uint(1),
            ),
            vec4(0),
          ),
        );
    });
  })().compute(LIVING_FLOWER.maximumBrushSamples);

  const rayValues = rayStorage.value.array;
  let validatedRevision = -1;
  let disposed = false;

  function dispatchPick(renderer) {
    renderer.compute(pickNode);
  }

  async function warmup(renderer) {
    sampleCountNode.value = 0;
    dispatchPick(renderer);
    await renderer.getArrayBufferAsync(
      hitStorage.value,
      null,
      0,
      4 * Float32Array.BYTES_PER_ELEMENT,
    );
  }

  function prepare(renderer, frame) {
    if (validatedRevision === frame.revision) return;
    const sampleCount = Math.min(
      frame.sampleCount,
      LIVING_FLOWER.maximumBrushSamples,
    );
    for (let sample = 0; sample < sampleCount; sample += 1) {
      const offset = sample * 8;
      const { origin, direction, screenUv } = frame.rays[sample];
      rayValues[offset] = origin.x;
      rayValues[offset + 1] = origin.y;
      rayValues[offset + 2] = origin.z;
      rayValues[offset + 3] = screenUv.x;
      rayValues[offset + 4] = direction.x;
      rayValues[offset + 5] = direction.y;
      rayValues[offset + 6] = direction.z;
      rayValues[offset + 7] = screenUv.y;
    }
    rayStorage.value.needsUpdate = true;
    sampleCountNode.value = sampleCount;
    dispatchPick(renderer);
    validatedRevision = frame.revision;
    frame.validatedRevision = validatedRevision;
  }

  async function readLatestContact(renderer, frame) {
    if (
      disposed ||
      !frame.held ||
      frame.sampleCount === 0 ||
      validatedRevision !== frame.revision
    ) {
      return null;
    }
    const revision = frame.revision;
    const latestSample = Math.min(
      frame.sampleCount,
      LIVING_FLOWER.maximumBrushSamples,
    ) - 1;
    const contactBuffer = await renderer.getArrayBufferAsync(
      hitStorage.value,
      null,
      latestSample * 4 * Float32Array.BYTES_PER_ELEMENT,
      4 * Float32Array.BYTES_PER_ELEMENT,
    );
    const values = new Float32Array(contactBuffer);
    const contactMarker = values[3];
    const encodedPetal = Math.floor(contactMarker);
    const encodedPatch = Math.round(
      (contactMarker - encodedPetal) * 1024,
    );
    return {
      revision,
      valid: encodedPetal > 0,
      positionX: values[0],
      positionY: values[1],
      positionZ: values[2],
      petalIndex: Math.max(-1, encodedPetal - 1),
      cellIndex: encodedPetal > 0 ? Math.floor(encodedPatch / 2) : -1,
      triangleIndex: encodedPetal > 0 ? encodedPatch % 2 : -1,
    };
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    pickNode.dispose();
    rayStorage.value.dispose();
    hitStorage.value.dispose();
  }

  return {
    rayStorage,
    hitStorage,
    sampleCountNode,
    warmup,
    prepare,
    readLatestContact,
    dispose,
  };
}
