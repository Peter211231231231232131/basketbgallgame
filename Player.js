import * as THREE from 'three';
import { Trajectory } from './Trajectory.js';

export class Player {
    constructor(camera, scene) {
        this.camera = camera;
        this.scene = scene;
        this.ball = null; // Reference to the shared ball
        this.hasBall = false;

        // Trajectory Helper
        this.trajectory = new Trajectory(this.scene);

        // Parameters
        this.speed = 10.0;
        this.runSpeed = 18.0;
        this.jumpForce = 12.0;
        this.gravity = 30.0;

        // Dimensions
        this.height = 1.6;
        this.width = 0.6; // Player is a 0.6x1.6x0.6 box conceptually

        // State
        this.velocity = new THREE.Vector3();
        this.onGround = false;

        // Input State
        this.moveForward = false;
        this.moveBackward = false;
        this.moveLeft = false;
        this.moveRight = false;
        this.canJump = false;
        this.isRunning = false;
        this.currentPower = 20.0; // Default power via +/-
        this.showTrajectory = true; // Default ON
        this.throwCooldown = 0.0; // Prevent instant pickup

        // Stamina System
        this.maxStamina = 60;
        this.stamina = 60;
        this.staminaDrainRate = 30; // Per second
        this.staminaRegenRate = 15; // Per second

        // Sprinting
        this.speed = 6.0;
        this.sprintMultiplier = 1.7; // ~10.2 speed when sprinting

        // Optimization: Reusable Vectors
        this.tempVec = new THREE.Vector3();
        this.tempDir = new THREE.Vector3();

        // AABB Helpers (reused to avoid GC)
        this.playerBox = new THREE.Box3();
        this.elementBox = new THREE.Box3();

        this.initControls();
        this.setupCamera();
    }

    assignBall(ball) {
        this.ball = ball;
    }

    setupCamera() {
        this.camera.rotation.order = 'YXZ';
    }

    initControls() {
        document.addEventListener('click', () => {
            if (document.pointerLockElement !== document.body) {
                document.body.requestPointerLock();
            }
        });

        document.addEventListener('mousedown', (e) => {
            console.log("Mouse Down:", e.button, "Locked:", document.pointerLockElement === document.body);
            if (document.pointerLockElement === document.body && e.button === 0) {

                // If has ball, throw it
                if (this.hasBall && this.ball) {
                    console.log("Shooting!");
                    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
                    const velocity = dir.multiplyScalar(this.currentPower);

                    this.ball.release(velocity);
                    this.hasBall = false;
                    this.throwCooldown = 0.5; // 0.5s cooldown
                } else {
                    console.log("Click ignored: No Ball or Ball ref null", this.hasBall, this.ball);
                }
            }
        });

        document.addEventListener('mousemove', (event) => {
            if (document.pointerLockElement === document.body) {
                this.camera.rotation.y -= event.movementX * 0.002;
                // Clamp vertical look
                this.camera.rotation.x -= event.movementY * 0.002;
                this.camera.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.camera.rotation.x));
            }
        });

        // Pickup Logic in update loop is better, but maybe 'E' to pickup?
        // User asked for "fight", so auto-pickup on collision/proximity is best for fast pacing.
        const onKey = (code) => {
            switch (code) {
                case 'ArrowUp': case 'KeyW': this.moveForward = true; break;
                case 'ArrowLeft': case 'KeyA': this.moveLeft = true; break;
                case 'ArrowDown': case 'KeyS': this.moveBackward = true; break;
                case 'ArrowRight': case 'KeyD': this.moveRight = true; break;
                case 'Space': if (this.onGround) this.velocity.y = this.jumpForce; break;
                case 'ShiftLeft': case 'ShiftRight': this.isRunning = true; break;

                // New Controls
                case 'KeyL':
                    this.showTrajectory = !this.showTrajectory;
                    break;
                case 'KeyE':
                    this.attemptSteal();
                    break;
                case 'Equal': // +
                case 'NumpadAdd':
                    this.currentPower = Math.min(this.currentPower + 35, 35);
                    break;
                case 'Minus': // -
                case 'NumpadSubtract':
                    this.currentPower = Math.max(this.currentPower - 1, 10);
                    break;
            }
        };

        const onKeyUp = (code) => {
            switch (code) {
                case 'ArrowUp': case 'KeyW': this.moveForward = false; break;
                case 'ArrowLeft': case 'KeyA': this.moveLeft = false; break;
                case 'ArrowDown': case 'KeyS': this.moveBackward = false; break;
                case 'ArrowRight': case 'KeyD': this.moveRight = false; break;
                case 'ShiftLeft': case 'ShiftRight': this.isRunning = false; break;
            }
        };

        document.addEventListener('keydown', (e) => onKey(e.code));
        document.addEventListener('keyup', (e) => onKeyUp(e.code));
    }

    update(delta, collidables) {
        if (document.pointerLockElement !== document.body) {
            this.velocity.set(0, 0, 0);
            return;
        }

        // --- 1. Physics Constants & Damping ---
        const damping = 10.0;
        this.velocity.x -= this.velocity.x * damping * delta;
        this.velocity.z -= this.velocity.z * damping * delta;
        this.velocity.y -= this.gravity * delta; // Gravity always applies

        // --- 2. Input Handling (Movement) ---
        // Stamina Logic
        let usingSprint = false;
        if (this.isRunning && this.stamina > 0) {
            // Moving?
            if (this.moveForward || this.moveBackward || this.moveLeft || this.moveRight) {
                usingSprint = true;
                this.stamina -= this.staminaDrainRate * delta;
                if (this.stamina < 0) this.stamina = 0;
            }
        } else {
            this.stamina += this.staminaRegenRate * delta;
            if (this.stamina > this.maxStamina) this.stamina = this.maxStamina;
        }

        const targetSpeed = this.speed * (usingSprint ? this.sprintMultiplier : 1.0);
        const acceleration = 200.0; // High acceleration for snappy movement

        // Strict Camera-Forward Movement (Y-projected)
        // Optimization: Use this.tempVec and this.tempDir to avoid GC
        this.tempDir.set(0, 0, 0);

        // Forward
        this.tempVec.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
        this.tempVec.y = 0;
        this.tempVec.normalize();
        if (this.moveForward) this.tempDir.add(this.tempVec);
        if (this.moveBackward) this.tempDir.sub(this.tempVec);

        // Right
        this.tempVec.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
        this.tempVec.y = 0;
        this.tempVec.normalize();
        if (this.moveRight) this.tempDir.add(this.tempVec);
        if (this.moveLeft) this.tempDir.sub(this.tempVec);

        if (this.tempDir.lengthSq() > 0) {
            this.tempDir.normalize();
            this.velocity.x += this.tempDir.x * acceleration * delta;
            this.velocity.z += this.tempDir.z * acceleration * delta;
        }

        // Cap horizontal speed
        const currentHorizSpeed = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
        if (currentHorizSpeed > targetSpeed) {
            const ratio = targetSpeed / currentHorizSpeed;
            this.velocity.x *= ratio;
            this.velocity.z *= ratio;
        }

        // --- 3. Sequential Axis Collision Resolution ---
        // We apply velocity and resolve collisions immediately per axis.
        // If we are overlapping (even with V=0), we push out by Minimum Translations.

        this.onGround = false; // Reset, prove grounded in Y check

        // X Axis
        this.camera.position.x += this.velocity.x * delta;
        this.resolveCollisions(collidables, 'x');

        // Z Axis
        this.camera.position.z += this.velocity.z * delta;
        this.resolveCollisions(collidables, 'z');

        // Y Axis
        this.camera.position.y += this.velocity.y * delta;
        this.resolveCollisions(collidables, 'y');

        // Floor Safety (Fall Limit)
        if (this.camera.position.y < -20) {
            this.camera.position.set(0, 5, 5); // Respawn with offset
            this.velocity.set(0, 0, 0);
        }

        // --- 4. Ball Interaction ---
        if (this.throwCooldown > 0) {
            this.throwCooldown -= delta;
        }

        if (this.hasBall && this.ball) {
            // Check if we still own it (Bot might have stolen it)
            if (this.ball.owner !== this) {
                this.hasBall = false;
                return;
            }

            // Carry Ball
            // Position it in front of camera
            const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
            const holdPos = this.camera.position.clone().add(dir.multiplyScalar(1.0)); // 1m in front
            holdPos.y -= 0.2; // Slightly down
            this.ball.mesh.position.copy(holdPos);
        } else if (this.ball && !this.ball.owner) {
            // Check Pickup only if cooldown allows
            if (this.throwCooldown <= 0) {
                const dist = this.camera.position.distanceTo(this.ball.mesh.position);
                if (dist < 2.0) {
                    // Grab!
                    console.log("Picked up ball!");
                    this.ball.grab(this);
                    this.hasBall = true;
                }
            }
        }

        // --- 5. Trajectory Update ---
        if (this.showTrajectory && this.hasBall) {
            const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
            const spawnPos = this.camera.position.clone().add(dir.clone().multiplyScalar(0.5));
            const velocity = dir.multiplyScalar(this.currentPower);

            this.trajectory.update(spawnPos, velocity, collidables);
        } else {
            this.trajectory.setVisibility(false);
        }
    }

    resolveCollisions(collidables, axis) {
        const pos = this.camera.position;
        const w = this.width / 2;
        const h = this.height;

        // Update Player Box
        this.playerBox.set(
            new THREE.Vector3(pos.x - w, pos.y - h, pos.z - w),
            new THREE.Vector3(pos.x + w, pos.y, pos.z + w)
        );

        for (const object of collidables) {
            if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
            this.elementBox.copy(object.geometry.boundingBox).applyMatrix4(object.matrixWorld);

            if (this.playerBox.intersectsBox(this.elementBox)) {
                // Get Overlaps
                const overlapX = Math.min(this.playerBox.max.x, this.elementBox.max.x) - Math.max(this.playerBox.min.x, this.elementBox.min.x);
                const overlapY = Math.min(this.playerBox.max.y, this.elementBox.max.y) - Math.max(this.playerBox.min.y, this.elementBox.min.y);
                const overlapZ = Math.min(this.playerBox.max.z, this.elementBox.max.z) - Math.max(this.playerBox.min.z, this.elementBox.min.z);

                // Ignore tiny touches (floating point error)
                if (Math.abs(overlapX) < 0.001 || Math.abs(overlapY) < 0.001 || Math.abs(overlapZ) < 0.001) continue;

                // Resolve based on CURRENT AXIS of movement loop
                // This prevents "corner sliding" by only correcting the component we just changed.

                if (axis === 'x') {
                    // If we moved X, correct X.
                    if (overlapX > 0) {
                        const dir = pos.x - this.elementBox.getCenter(this.tempVec).x;
                        // Push away from center of box, OR opposite to velocity if moving
                        const sign = (this.velocity.x !== 0) ? -Math.sign(this.velocity.x) : Math.sign(dir);

                        pos.x += overlapX * sign;
                        this.velocity.x = 0;
                    }
                } else if (axis === 'z') {
                    if (overlapZ > 0) {
                        const dir = pos.z - this.elementBox.getCenter(this.tempVec).z;
                        const sign = (this.velocity.z !== 0) ? -Math.sign(this.velocity.z) : Math.sign(dir);

                        pos.z += overlapZ * sign;
                        this.velocity.z = 0;
                    }
                } else if (axis === 'y') {
                    if (overlapY > 0) {
                        // Check if we are moving down (landing) or up (hitting head)
                        if (this.velocity.y < 0) {
                            // Landed
                            pos.y += overlapY;
                            this.onGround = true;
                            this.velocity.y = 0;
                        } else if (this.velocity.y > 0) {
                            // Head hit
                            pos.y -= overlapY;
                            this.velocity.y = 0;
                        } else {
                            // Resting overlap (spawn or jitter) - push UP out of floor
                            pos.y += overlapY;
                            this.onGround = true;
                        }
                    }
                }

                // Re-update box after correction to prevent double correction
                this.playerBox.set(
                    new THREE.Vector3(pos.x - w, pos.y - h, pos.z - w),
                    new THREE.Vector3(pos.x + w, pos.y, pos.z + w)
                );
            }
        }
    }

    attemptSteal() {
        if (this.hasBall || !this.ball || !this.ball.owner) return;

        // Check Distance
        const dist = this.camera.position.distanceTo(this.ball.mesh.position);
        if (dist > 3.0) return; // Must be close

        // Check Aim
        // Dot product of Camera Forward vs Dir to Ball
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
        const toBall = this.ball.mesh.position.clone().sub(this.camera.position).normalize();
        const dot = forward.dot(toBall);

        if (dot > 0.9) { // ~25 degree cone
            console.log("Stolen!");
            this.ball.grab(this);
            this.hasBall = true;
            this.throwCooldown = 0.5; // Prevent instant throw? No, cooldown is for pickup.
        } else {
            console.log("Steal Missed: Bad Aim", dot);
        }
    }

    getPowerRatio() {
        const min = 10;
        const max = 35;
        return (this.currentPower - min) / (max - min);
    }
}
