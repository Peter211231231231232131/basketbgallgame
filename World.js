import * as THREE from 'three';

export class World {
    constructor(scene) {
        this.scene = scene;
        this.collidables = [];
        this.triggers = []; // For scoring
        this.init();
    }

    init() {
        // Lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
        dirLight.position.set(10, 20, 10);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        this.scene.add(dirLight);

        // Floor (Wood Court)
        // Size: 30m length (Z), 15m width (X)
        const floorGeometry = new THREE.BoxGeometry(20, 1, 34);
        const floorMaterial = new THREE.MeshStandardMaterial({
            color: 0xD2691E, // Chocolate/Wood
            roughness: 0.1,
            metalness: 0.1
        });
        const floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.position.y = -0.5;
        floor.receiveShadow = true;
        this.scene.add(floor);
        this.collidables.push(floor);

        // Lines (Optional Grid helper just to see)
        const grid = new THREE.GridHelper(34, 34);
        this.scene.add(grid);

        // Walls (invisible or simple fences) to keep ball in
        const wallMat = new THREE.MeshStandardMaterial({ color: 0x888888, transparent: true, opacity: 0.3 });

        // Side Walls
        this.createBox(new THREE.Vector3(10.5, 2, 0), new THREE.Vector3(1, 5, 34), true, 0x888888); // Right
        this.createBox(new THREE.Vector3(-10.5, 2, 0), new THREE.Vector3(1, 5, 34), true, 0x888888); // Left
        this.createBox(new THREE.Vector3(0, 2, -17.5), new THREE.Vector3(22, 5, 1), true, 0x888888); // Far
        this.createBox(new THREE.Vector3(0, 2, 17.5), new THREE.Vector3(22, 5, 1), true, 0x888888); // Near

        // Hoops
        // Hoop 1 (Far / Enemy Hoop) at Z = -15
        this.createHoop(new THREE.Vector3(0, 0, -15), true);

        // Hoop 2 (Near / Player Hoop) at Z = +15, rotated 180?
        // My simple createHoop builds it facing +Z or similar?
        // Let's modify createHoop or just build it manually/mirrored.
        // Actually simplest is to just build it at +15 facing -Z.
        this.createHoop(new THREE.Vector3(0, 0, 15), false);
    }

    createBox(pos, size, isStatic, color) {
        const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
        const material = new THREE.MeshStandardMaterial({ color: color });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(pos);

        if (isStatic) {
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            this.collidables.push(mesh);
        } else {
            // Dynamic objects logic if needed
        }

        this.scene.add(mesh);
        return mesh;
    }

    createHoop(pos, facingForward) {
        const postColor = 0x333333;
        const boardColor = 0xffffff;
        const rimColor = 0xff4500;

        // Z-offset direction for board/rim
        // If facingForward (Far hoop), board is behind rim (Z min), playing towards +Z?
        // No, standard: Far hoop is at -15. Board is at -15.5. Rim at -14.5.
        // Near hoop is at +15. Board at +15.5. Rim at +14.5.

        const zDir = facingForward ? 1 : -1;

        // Post
        this.createBox(new THREE.Vector3(pos.x, 1.5, pos.z - (0.5 * zDir)), new THREE.Vector3(0.3, 3, 0.3), true, postColor);

        // Backboard
        const boardPos = new THREE.Vector3(pos.x, 3, pos.z);
        this.createBox(boardPos, new THREE.Vector3(1.8, 1.2, 0.1), true, boardColor);

        // Rim
        const rimCenter = new THREE.Vector3(pos.x, 2.8, pos.z + (0.45 * zDir));
        const radius = 0.3;
        const thickness = 0.05;

        // Simple square rim for collision
        this.createBox(new THREE.Vector3(rimCenter.x - radius, rimCenter.y, rimCenter.z), new THREE.Vector3(thickness, thickness, radius * 2), true, rimColor);
        this.createBox(new THREE.Vector3(rimCenter.x + radius, rimCenter.y, rimCenter.z), new THREE.Vector3(thickness, thickness, radius * 2), true, rimColor);
        this.createBox(new THREE.Vector3(rimCenter.x, rimCenter.y, rimCenter.z - radius), new THREE.Vector3(radius * 2, thickness, thickness), true, rimColor);
        this.createBox(new THREE.Vector3(rimCenter.x, rimCenter.y, rimCenter.z + radius), new THREE.Vector3(radius * 2, thickness, thickness), true, rimColor);

        // Score Trigger (Make it specific to this hoop?)
        // storing triggers with metadata would be good. For now just list.
        this.createTrigger(new THREE.Vector3(rimCenter.x, rimCenter.y - 0.3, rimCenter.z), new THREE.Vector3(0.5, 0.2, 0.5));
    }

    createTrigger(position, size) {
        // Invisible box for scoring detection
        const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
        // Use BasicMaterial with visible: false logic if needed, or simple transparent
        // checking bounding box overlaps logically
        const trigger = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ visible: false }));
        trigger.position.copy(position);
        trigger.geometry.computeBoundingBox();
        trigger.updateMatrixWorld();

        // We add it to scene for debug (wireframe helper could be nice), but for now just logical
        this.scene.add(trigger); // Needed for matrix update? yes
        this.triggers.push(trigger);
    }

    getCollidables() { return this.collidables; }
    getTriggers() { return this.triggers; }
}
