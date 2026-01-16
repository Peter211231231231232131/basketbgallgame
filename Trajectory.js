import * as THREE from 'three';

export class Trajectory {
    constructor(scene) {
        this.scene = scene;
        this.pointCount = 30; // Number of dots
        this.stepSize = 0.05;

        // Geometry & Material (Dots)
        const geometry = new THREE.SphereGeometry(0.05, 8, 8); // Thickness 0.1
        const material = new THREE.MeshBasicMaterial({ color: 0xffffff });

        this.mesh = new THREE.InstancedMesh(geometry, material, this.pointCount);
        this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.mesh.visible = false;
        this.scene.add(this.mesh);

        // Dummy for matrix calculations
        this.dummy = new THREE.Object3D();

        // Physics Params
        this.gravity = 15.0;
        this.drag = 0.5;

        this.raycaster = new THREE.Raycaster();
    }

    update(origin, velocity, collidables) {
        this.mesh.visible = true;

        // Simulation State
        const pos = origin.clone();
        const vel = velocity.clone();
        const nextPos = new THREE.Vector3();

        let stopped = false;

        // Simulate
        for (let i = 0; i < this.pointCount; i++) {
            if (stopped) {
                // Hide remaining dots
                this.dummy.position.set(0, -999, 0);
                this.dummy.scale.set(0, 0, 0);
                this.dummy.updateMatrix();
                this.mesh.setMatrixAt(i, this.dummy.matrix);
                continue;
            }

            // Physics Step
            vel.y -= this.gravity * this.stepSize;
            vel.x -= vel.x * this.drag * this.stepSize;
            vel.z -= vel.z * this.drag * this.stepSize;

            nextPos.copy(pos).addScaledVector(vel, this.stepSize);

            // Check Collision (Raycast from pos to nextPos)
            const direction = nextPos.clone().sub(pos);
            const distance = direction.length();
            direction.normalize();

            this.raycaster.set(pos, direction);
            this.raycaster.far = distance;

            // Filter meshes only? For now intersectObjects is fine
            // We assume collidables are Meshes
            const intersects = this.raycaster.intersectObjects(collidables, false);

            if (intersects.length > 0) {
                // Hit! Move to hit point and stop
                pos.copy(intersects[0].point);
                stopped = true;
            } else {
                pos.copy(nextPos);
            }

            // Render Dot
            this.dummy.position.copy(pos);

            // Floor check (hardcoded fallback if no floor collider passed)
            if (pos.y < 0 && !stopped) {
                // Should have hit floor collider, but just in case
            }

            this.dummy.scale.set(1, 1, 1);
            this.dummy.updateMatrix();
            this.mesh.setMatrixAt(i, this.dummy.matrix);
        }

        this.mesh.instanceMatrix.needsUpdate = true;
    }

    setVisibility(visible) {
        this.mesh.visible = visible;
    }
}
