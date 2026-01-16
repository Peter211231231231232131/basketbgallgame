import * as THREE from 'three';

export class Ball {
    constructor(scene) {
        this.scene = scene;
        this.radius = 0.15; // Basketball approx radius

        // Mesh
        const geometry = new THREE.SphereGeometry(this.radius, 32, 32);
        const material = new THREE.MeshStandardMaterial({ color: 0xff4500, roughness: 0.5 });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        this.scene.add(this.mesh);

        // Physics State
        this.active = true; // Always active in 1v1 unless waiting respawn
        this.owner = null; // Entity holding the ball
        this.velocity = new THREE.Vector3();
        this.gravity = 20.0;
        this.restitution = 0.8; // Bounciness
        this.friction = 2.0;

        // Initial Spawn
        this.mesh.position.set(0, 5, 0); // Drop in center
        this.mesh.visible = true;

        // Helpers
        this.ballBox = new THREE.Box3();
        this.colliderBox = new THREE.Box3(); // Reusable for other objects

        // Trail Effect
        this.trailLength = 30;
        this.trailPositions = new Float32Array(this.trailLength * 3); // x,y,z per point
        this.trailGeometry = new THREE.BufferGeometry();
        this.trailGeometry.setAttribute('position', new THREE.BufferAttribute(this.trailPositions, 3));

        // Neon Material
        const trailMaterial = new THREE.LineBasicMaterial({
            color: 0x00ffff, // Cyan neon
            linewidth: 2, // Note: linewidth is often 1 in WebGL, but good intent
            transparent: true,
            opacity: 0.6
        });

        this.trailMesh = new THREE.Line(this.trailGeometry, trailMaterial);
        this.trailMesh.frustumCulled = false; // Always draw
        this.scene.add(this.trailMesh);
    }

    grab(entity) {
        this.owner = entity;
        this.velocity.set(0, 0, 0);
        this.resetTrail(this.mesh.position);
    }

    release(velocity) {
        if (!this.owner) return;

        // Start from owner's hold position + slight offset
        // We assume owner has a calculateHoldPos or similar, 
        // or we just use current ball pos which should be updated by owner.
        // But better: use the passed velocity and clear owner.
        this.velocity.copy(velocity);
        this.owner = null;
    }

    update(delta, collidables) {
        if (this.owner) {
            // Ball is held. Follow owner.
            // Owner should define where the ball is.
            // We'll assume owner updates it, OR we ask owner.
            // Let's assume owner updates the ball position in THEIR update loop 
            // to match animation/hands.
            this.resetTrail(this.mesh.position);
            this.trailMesh.visible = false;
            return;
        }

        this.updateTrail();

        // Sub-stepping configuration
        const subStepSize = 0.01; // 10ms steps
        let remainingTime = delta;

        while (remainingTime > 0) {
            const dt = Math.min(remainingTime, subStepSize);
            remainingTime -= dt;
            this.step(dt, collidables);
        }

        // Floor safety
        if (this.mesh.position.y < -10) {
            this.reset();
        }
    }

    reset() {
        this.mesh.position.set(0, 5, 0);
        this.velocity.set(0, 0, 0);
        this.owner = null;
        this.active = true;
        this.resetTrail(this.mesh.position);
        this.mesh.visible = true;
    }

    step(dt, collidables) {
        // Apply Gravity
        const gravity = 15.0;
        this.velocity.y -= gravity * dt;

        // Air Resistance (Drag)
        const drag = 0.5;
        this.velocity.x -= this.velocity.x * drag * dt;
        this.velocity.z -= this.velocity.z * drag * dt;

        // Move Step-by-Step
        const potentialPos = this.mesh.position.clone().addScaledVector(this.velocity, dt);

        // Update Ball AABB
        // Assuming ball is a cube of size radius * 2
        const r = this.radius;
        this.ballBox.set(
            new THREE.Vector3(potentialPos.x - r, potentialPos.y - r, potentialPos.z - r),
            new THREE.Vector3(potentialPos.x + r, potentialPos.y + r, potentialPos.z + r)
        );

        let collided = false;

        // Check vs Collidables
        for (const object of collidables) {
            // We need AABB of object
            if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
            this.colliderBox.copy(object.geometry.boundingBox).applyMatrix4(object.matrixWorld);

            if (this.ballBox.intersectsBox(this.colliderBox)) {
                // Collision vs Box!
                // Using Minimum Translation Vector (MTV) via Separating Axis Theorem ideas for AABB

                // Calculate overlap on each axis
                const overlapX = Math.min(this.ballBox.max.x, this.colliderBox.max.x) - Math.max(this.ballBox.min.x, this.colliderBox.min.x);
                const overlapY = Math.min(this.ballBox.max.y, this.colliderBox.max.y) - Math.max(this.ballBox.min.y, this.colliderBox.min.y);
                const overlapZ = Math.min(this.ballBox.max.z, this.colliderBox.max.z) - Math.max(this.ballBox.min.z, this.colliderBox.min.z);

                // Find smallest overlap (Axis of least penetration)
                // This is the direction we probably came from / should be pushed out to.
                let axis = 'y';
                let minOverlap = overlapY;

                if (overlapX < minOverlap) {
                    minOverlap = overlapX;
                    axis = 'x';
                }
                if (overlapZ < minOverlap) {
                    minOverlap = overlapZ;
                    axis = 'z';
                }

                // Normal determination
                const normal = new THREE.Vector3();

                if (axis === 'x') {
                    // Push Left or Right?
                    // Check relative centers
                    const ballCenter = potentialPos.x;
                    const boxCenter = this.colliderBox.getCenter(new THREE.Vector3()).x;
                    const sign = Math.sign(ballCenter - boxCenter);
                    normal.set(sign, 0, 0);
                    potentialPos.x += overlapX * sign;
                } else if (axis === 'y') {
                    const ballCenter = potentialPos.y;
                    const boxCenter = this.colliderBox.getCenter(new THREE.Vector3()).y;
                    const sign = Math.sign(ballCenter - boxCenter);
                    normal.set(0, sign, 0);
                    potentialPos.y += overlapY * sign;
                } else { // z
                    const ballCenter = potentialPos.z;
                    const boxCenter = this.colliderBox.getCenter(new THREE.Vector3()).z;
                    const sign = Math.sign(ballCenter - boxCenter);
                    normal.set(0, 0, sign);
                    potentialPos.z += overlapZ * sign;
                }

                // Reflect Velocity
                const dot = this.velocity.dot(normal);
                if (dot < 0) {
                    const reflection = normal.multiplyScalar(2 * dot);
                    this.velocity.sub(reflection);
                    this.velocity.multiplyScalar(this.restitution);

                    // Friction (only if hitting floor/top, but mostly floor Y+)
                    if (Math.abs(normal.y) > 0.5) {
                        this.velocity.x -= this.velocity.x * this.friction * dt;
                        this.velocity.z -= this.velocity.z * this.friction * dt;
                    }
                }

                collided = true;

                // Update BallBox for next check in this same loop? 
                // Ideally yes, but multiple collisions in one substep is rare/complex.
                // Just updating position effectively handles it for next frame/substep.
            }
        }

        // Apply final position for this substep
        this.mesh.position.copy(potentialPos);
    }

    updateTrail() {
        if (!this.active && !this.mesh.visible) {
            // Hide trail if ball inactive
            this.trailMesh.visible = false;
            return;
        }

        this.trailMesh.visible = true;

        // Shift positions down
        // We want the head (index 0) to be current pos
        // Tail is at end

        // Shift data: Move everything from 0..(N-1) to 3..N
        // Actually simpler: Treat as a cyclic buffer or just copy
        // For 30 points, copyWithin is fast enough

        // Strategy: 
        // [0] = newest
        // [last] = oldest
        // Move [0..last-1] to [1..last]

        // Float32Array doesn't support unshift nicely.
        // We iterate backwards
        for (let i = this.trailLength - 1; i > 0; i--) {
            const currentIdx = i * 3;
            const prevIdx = (i - 1) * 3;
            this.trailPositions[currentIdx] = this.trailPositions[prevIdx];
            this.trailPositions[currentIdx + 1] = this.trailPositions[prevIdx + 1];
            this.trailPositions[currentIdx + 2] = this.trailPositions[prevIdx + 2];
        }

        // Set head to current
        this.trailPositions[0] = this.mesh.position.x;
        this.trailPositions[1] = this.mesh.position.y;
        this.trailPositions[2] = this.mesh.position.z;

        this.trailGeometry.attributes.position.needsUpdate = true;
    }

    resetTrail(pos) {
        // Initialize all points to spawn pos so we don't smear from 0,0,0
        for (let i = 0; i < this.trailLength; i++) {
            this.trailPositions[i * 3] = pos.x;
            this.trailPositions[i * 3 + 1] = pos.y;
            this.trailPositions[i * 3 + 2] = pos.z;
        }
        this.trailGeometry.attributes.position.needsUpdate = true;
        this.trailMesh.visible = true;
    }
}
