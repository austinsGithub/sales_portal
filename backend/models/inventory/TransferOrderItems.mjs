import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const TransferOrderItem = sequelize.define('TransferOrderItem', {
    transfer_order_item_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    transfer_order_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'transfer_orders',
        key: 'transfer_order_id'
      }
    },
    loadout_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'container_loadouts',
        key: 'loadout_id'
      }
    },
    inventory_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'inventory',
        key: 'inventory_id'
      }
    },
    part_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      references: {
        model: 'parts',
        key: 'part_id'
      }
    },
    lot_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'lots',
        key: 'lot_id'
      }
    },
    serial_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    quantity: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 1.00
    },
    unit_of_measure: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    serial_number: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    expiration_date: {
      type: DataTypes.DATE,
      allowNull: true
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    company_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'companies',
        key: 'company_id'
      }
    }
  }, {
    tableName: 'transfer_order_items',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  TransferOrderItem.associate = (models) => {
    TransferOrderItem.belongsTo(models.TransferOrder, {
      foreignKey: 'transfer_order_id'
    });
    
    TransferOrderItem.belongsTo(models.ContainerLoadout, {
      as: 'loadout',
      foreignKey: 'loadout_id'
    });
    
    TransferOrderItem.belongsTo(models.Inventory, {
      as: 'inventory',
      foreignKey: 'inventory_id'
    });
    
    TransferOrderItem.belongsTo(models.Part, {
      as: 'part',
      foreignKey: 'part_id'
    });
    
    TransferOrderItem.belongsTo(models.Lot, {
      as: 'lot',
      foreignKey: 'lot_id'
    });
    
    TransferOrderItem.belongsTo(models.Company, {
      foreignKey: 'company_id'
    });
  };

  return TransferOrderItem;
};
