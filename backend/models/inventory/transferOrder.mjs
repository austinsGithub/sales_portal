import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const TransferOrder = sequelize.define('TransferOrder', {
    transfer_order_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    transfer_order_number: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true
    },
    from_location_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'locations',
        key: 'location_id'
      }
    },
    to_location_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'locations',
        key: 'location_id'
      }
    },
    destination_type: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'general_delivery'
    },
    destination_loadout_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'container_loadouts',
        key: 'loadout_id'
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
    blueprint_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'container_blueprints',
        key: 'blueprint_id'
      }
    },
    shipment_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'shipments',
        key: 'shipment_id'
      }
    },
    transfer_reason: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    status: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'Pending'
    },
    priority: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'Medium'
    },
    requested_date: {
      type: DataTypes.DATE,
      allowNull: true
    },
    approved_date: {
      type: DataTypes.DATE,
      allowNull: true
    },
    ship_date: {
      type: DataTypes.DATE,
      allowNull: true
    },
    expected_arrival_date: {
      type: DataTypes.DATE,
      allowNull: true
    },
    received_date: {
      type: DataTypes.DATE,
      allowNull: true
    },
    completed_date: {
      type: DataTypes.DATE,
      allowNull: true
    },
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'user_id'
      }
    },
    approved_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'user_id'
      }
    },
    shipped_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'user_id'
      }
    },
    received_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'user_id'
      }
    },
    carrier: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    tracking_number: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    freight_cost: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true
    },
    temperature_control_required: {
      type: DataTypes.TINYINT(1),
      allowNull: true,
      defaultValue: 0
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
    tableName: 'transfer_orders',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  TransferOrder.associate = (models) => {
    TransferOrder.belongsTo(models.Location, {
      as: 'fromLocation',
      foreignKey: 'from_location_id'
    });
    
    TransferOrder.belongsTo(models.Location, {
      as: 'toLocation',
      foreignKey: 'to_location_id'
    });
    
    TransferOrder.belongsTo(models.ContainerLoadout, {
      as: 'loadout',
      foreignKey: 'loadout_id'
    });
    
    TransferOrder.belongsTo(models.Shipment, {
      as: 'shipment',
      foreignKey: 'shipment_id'
    });
    
    TransferOrder.belongsTo(models.User, {
      as: 'creator',
      foreignKey: 'created_by'
    });
    
    TransferOrder.belongsTo(models.User, {
      as: 'approver',
      foreignKey: 'approved_by'
    });
    
    TransferOrder.belongsTo(models.User, {
      as: 'shipper',
      foreignKey: 'shipped_by'
    });
    
    TransferOrder.belongsTo(models.User, {
      as: 'receiver',
      foreignKey: 'received_by'
    });
    
    TransferOrder.belongsTo(models.Company, {
      foreignKey: 'company_id'
    });
    
    TransferOrder.hasMany(models.TransferOrderItem, {
      as: 'items',
      foreignKey: 'transfer_order_id'
    });
  };

  return TransferOrder;
};
