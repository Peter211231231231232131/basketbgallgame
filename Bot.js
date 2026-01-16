import * as THREE from 'three';

export class Bot {
    constructor(scene, ball) {
        this.scene = scene;
        this.ball = ball;

        this.position = new THREE.Vector3(0, 1, -10); // Start opposite side
        this.velocity = new THREE.Vector3();
        this.speed = 6.0; // Same as Player
        this.sprintMultiplier = 1.7;
        this.stamina = 60;
        this.maxStamina = 60;
        this.staminaDrainRate = 30;
        this.staminaRegenRate = 15;
        this.hasBall = false;

        // Optimization
        this.tempVec = new THREE.Vector3();

        // Appearance
        const geometry = new THREE.CapsuleGeometry(0.5, 1, 4, 8);
        const material = new THREE.MeshStandardMaterial({ color: 0xff0000 }); // Red Bot
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.copy(this.position);
        this.mesh.castShadow = true;
        this.scene.add(this.mesh);

        // Logic
        this.targetHoop = new THREE.Vector3(0, 3, 15); // Bot shoots at P1 hoop (Z=15)
    }

    update(delta, collidables) {
        const distToBall = this.position.distanceTo(this.ball.mesh.position);

        // Stamina Logic for Bot (Simple: Sprint if chasing ball or attacking)
        let wantsToSprint = false;

        // AI Logic
        if (this.hasBall) {
            // ATTACK
            // Dynamic shooting range
            if (!this.shootDistance) {
                this.shootDistance = 6 + Math.random() * 8; // Random distance between 6m and 14m
            }

            // Optimization: Remove new Vector3()
            // To check distance flatly:
            // dist = sqrt(dx*dx + dz*dz)
            const dx = this.position.x - this.targetHoop.x; // Hoop x is 0
            const dz = this.position.z - this.targetHoop.z; // Hoop z is 15
            const dist = Math.sqrt(dx * dx + dz * dz);

            if (dist > this.shootDistance) {
                // Move towards hoop range
                // dir = (target - pos).normalize()
                this.tempVec.set(0, 0, 15).sub(this.position).normalize();
                this.tempVec.y = 0;

                // Simple Sprint Logic
                wantsToSprint = true;

                // Speed calculation
                let currentSpeed = this.speed;
                if (wantsToSprint && this.stamina > 0) {
                    currentSpeed = this.speed * this.sprintMultiplier;
                    this.stamina -= this.staminaDrainRate * delta;
                } else {
                    this.stamina += this.staminaRegenRate * delta;
                }
                if (this.stamina > this.maxStamina) this.stamina = this.maxStamina;
                if (this.stamina < 0) this.stamina = 0;

                this.position.addScaledVector(this.tempVec, currentSpeed * delta);
            } else {
                // Stop and Aim
                if (!this.aimingTime) this.aimingTime = 0;
                this.aimingTime += delta;

                // Turn to face hoop visually (conceptually)

                if (this.aimingTime > 0.2) { // Fast aim
                    // Shoot! 100% ACCURACY

                    // Aim for the absolute center of the rim (Swish)
                    // Rim is at Z = 14.55 (Far hoop is at -15/15... wait World.js says:
                    // Hoop 1 (Far) at Z=-15. Hoop 2 (Player) at Z=15.
                    // Bot shoots at P1 hoop (Z=15).
                    // World.js: "Near hoop is at +15. Board at +15.5. Rim at +14.5."
                    // Actually, let's verify World.js:
                    // this.createHoop(new THREE.Vector3(0, 0, 15), false); -> facing Z=-1 (towards -Z).
                    // RimCenter = pos.z + (0.45 * zDir) = 15 + (0.45 * -1) = 14.55.
                    // Correct. Target is (0, 2.8, 14.55).

                    const target = new THREE.Vector3(0, 2.8, 14.55);

                    // Fixed High Arc for clean entry
                    const shotAngle = 70;

                    const velocity = this.calculateShotVelocity(this.position, target, shotAngle);

                    if (velocity) {
                        console.log("Bot shooting perfect shot!");
                        this.ball.release(velocity);
                        this.hasBall = false;
                        this.aimingTime = 0;
                        this.shootDistance = null; // Reset for next time
                    } else {
                        // Should rarely happen with high arc
                        console.log("Bot shot calculation failed");
                        this.ball.release(new THREE.Vector3(0, 10, 0)); // Fail
                        this.hasBall = false;
                        this.aimingTime = 0;
                        this.shootDistance = null;
                    }
                }
            }

            // Carry Ball
            // If aiming, hold steady
            const holdOffset = new THREE.Vector3(0, 1.5, 0.5); // Overhead
            this.ball.mesh.position.copy(this.position).add(holdOffset);

        } else if (!this.ball.owner) {
            // CHASE LOOSE BALL
            const dir = this.ball.mesh.position.clone().sub(this.position).normalize();
            dir.y = 0; // Stay on floor
            this.position.addScaledVector(dir, this.speed * delta);

            // Pickup?
            if (distToBall < 1.5) {
                this.ball.grab(this);
                this.hasBall = true;
            }

        } else {
            // DEFEND (Ball owned by Player)
            const player = this.ball.owner;

            // Move between player and hoop? Basic chase for now.
            const dir = this.ball.mesh.position.clone().sub(this.position).normalize();
            dir.y = 0;
            this.position.addScaledVector(dir, (this.speed * 0.9) * delta); // Slightly faster on defense?

            // Steal Logic
            const distToPlayer = this.position.distanceTo(player.camera.position);
            // Player pos is camera pos roughly

            if (distToPlayer < 2.0) {
                if (!this.stealTimer) this.stealTimer = 0;
                this.stealTimer += delta;

                if (this.stealTimer > 1.0) { // 1 second continuous contact
                    console.log("Bot Stole Ball!");
                    this.ball.grab(this);
                    this.hasBall = true;
                    this.stealTimer = 0;
                    // Player needs to update their state?
                    // Player.js update loop checks `if (this.hasBall && this.ball.owner !== this)`?
                    // Currently Player.js doesn't auto-lose `hasBall` if logic changes externally.
                    // We need to fix that in Player.js or here.
                    // Actually Ball.grab updates owner. Player.js needs to check if it lost ownership.
                    player.hasBall = false; // Direct hack or better way? 
                    // Better: Player checks `ball.owner` in update.
                }
            } else {
                this.stealTimer = 0;
            }
        }

        // Update Mesh
        this.mesh.position.copy(this.position);

        // Simple Bounce collision with floor/walls? 
        // For MVP, just clamp
        this.position.y = 1; // Float
        this.position.x = Math.max(-9, Math.min(9, this.position.x));
        this.position.z = Math.max(-16, Math.min(16, this.position.z));
    }
    calculateShotVelocity(startPos, targetPos, angleDeg = 60) {
        const g = 15.0; // Must match Ball.js gravity
        const diff = targetPos.clone().sub(startPos);
        const y = diff.y;

        // Horizontal distance
        const diffXZ = new THREE.Vector3(diff.x, 0, diff.z);
        const x = diffXZ.length();

        // Fixed Angle Shot (High Arc is harder to block)
        const angle = angleDeg * (Math.PI / 180);

        // Formula: v = sqrt( (g * x^2) / (2 * cos^2(theta) * (x * tan(theta) - y)) )

        const term1 = g * x * x;
        const term2 = 2 * Math.pow(Math.cos(angle), 2);
        const term3 = (x * Math.tan(angle)) - y;

        if (term3 <= 0) return null; // Target is too high for this angle?

        const vSquared = term1 / (term2 * term3);
        const v = Math.sqrt(vSquared);

        // Construct velocity vector
        // Flatten direction to just XZ, normalize, scale by v * cos(angle)
        // Y component is v * sin(angle)

        const vH = v * Math.cos(angle); // Horizontal component
        const vY = v * Math.sin(angle); // Vertical component

        const velocity = diffXZ.normalize().multiplyScalar(vH);
        velocity.y = vY;

        return velocity;
    }
}
