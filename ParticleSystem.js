import * as THREE from 'three';

export class ParticleSystem {
    constructor(scene) {
        this.scene = scene;
        this.maxParticles = 1000;
        this.particles = [];

        // Geometry & Material (Confetti)
        // Size increased: 0.1 -> 0.2
        const geometry = new THREE.BoxGeometry(0.2, 0.2, 0.02);
        const material = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, side: THREE.DoubleSide });

        this.mesh = new THREE.InstancedMesh(geometry, material, this.maxParticles);
        this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.mesh.frustumCulled = false; // Disable culling to prevent invisi-bug
        this.scene.add(this.mesh);

        // CPU State
        this.dummy = new THREE.Object3D();
        this.colors = new Float32Array(this.maxParticles * 3);

        // Initialize pool
        for (let i = 0; i < this.maxParticles; i++) {
            this.particles.push({
                active: false,
                life: 0,
                position: new THREE.Vector3(),
                velocity: new THREE.Vector3(),
                rotationAxis: new THREE.Vector3(Math.random(), Math.random(), Math.random()).normalize(),
                rotationSpeed: Math.random() * 10,
                color: new THREE.Color().setHSL(Math.random(), 1, 0.5)
            });
            // Hide initially
            this.dummy.position.set(0, -999, 0); // Hide far away
            this.dummy.updateMatrix();
            this.mesh.setMatrixAt(i, this.dummy.matrix);

            // Init Color explicitly
            this.mesh.setColorAt(i, new THREE.Color(0xffffff));
        }
        this.mesh.instanceMatrix.needsUpdate = true;
        this.mesh.instanceColor.needsUpdate = true;
    }

    emit(position, count) {
        console.log("Emitting particles at", position); // Debug
        let spawned = 0;
        for (const p of this.particles) {
            if (!p.active) {
                p.active = true;
                p.life = 2.0; // 2 seconds
                p.position.copy(position);

                // Random Velocity (Explosion)
                const speed = 2 + Math.random() * 3;
                const angle = Math.random() * Math.PI * 2;
                const yBias = Math.random() * 0.5 + 0.5; // Mostly up

                p.velocity.set(
                    (Math.random() - 0.5) * speed,
                    (Math.random() * 0.5 + 0.5) * speed,
                    (Math.random() - 0.5) * speed
                );

                // Set Color
                const hue = Math.random();
                p.color.setHSL(hue, 1.0, 0.5);
                this.mesh.setColorAt(this.particles.indexOf(p), p.color);

                spawned++;
                if (spawned >= count) break;
            }
        }
        this.mesh.instanceColor.needsUpdate = true;
        this.mesh.instanceMatrix.needsUpdate = true;
    }

    update(delta) {
        let needsUpdate = false;

        for (let i = 0; i < this.maxParticles; i++) {
            const p = this.particles[i];

            if (p.active) {
                p.life -= delta;

                if (p.life <= 0) {
                    p.active = false;
                    this.dummy.position.set(0, -999, 0);
                    this.dummy.updateMatrix();
                    this.mesh.setMatrixAt(i, this.dummy.matrix);
                    needsUpdate = true;
                    continue;
                }

                // Physics
                p.velocity.y -= 9.8 * delta; // Gravity
                p.velocity.x *= 0.98; // Drag
                p.velocity.z *= 0.98;

                p.position.addScaledVector(p.velocity, delta);

                // Render
                this.dummy.position.copy(p.position);
                this.dummy.rotation.x += p.rotationSpeed * delta;
                this.dummy.rotation.y += p.rotationSpeed * delta;
                this.dummy.updateMatrix();
                this.mesh.setMatrixAt(i, this.dummy.matrix);

                // Scale out near end
                if (p.life < 0.5) {
                    const scale = p.life / 0.5;
                    // Reset matrix to apply scale... 
                    // To avoid complex matrix math manually, we use object3d
                    this.dummy.scale.set(scale, scale, scale);
                    this.dummy.updateMatrix();
                    this.mesh.setMatrixAt(i, this.dummy.matrix);
                    this.dummy.scale.set(1, 1, 1); // Reset helper
                }

                needsUpdate = true;
            }
        }

        if (needsUpdate) {
            this.mesh.instanceMatrix.needsUpdate = true;
        }
    }
}
